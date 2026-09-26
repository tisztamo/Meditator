import { MObserver } from "./mObserver.js";
import { complete, generateImage } from "../../modelAccess/llm.js";
import { resolveModelRef } from "../../modelAccess/modelConfig.js";
import { decide, readChoice } from "../../modelAccess/decide.js";
import { parseTime } from "../../config/timeParser.js";
import { logger } from "../../infrastructure/logger.js";

const log = logger("mImage.js");

/**
 * Parses the image-decision model's reply tolerantly. Returns
 * { prompt: string|null, salience: number|null, reason: "image"|"none"|"empty" }.
 */
export function parseImageDecision(text) {
  let raw = (text || "").trim();
  if (!raw) return { prompt: null, salience: null, reason: "empty" };
  if (raw.length > 1 && /^["'][\s\S]*["']$/.test(raw)) raw = raw.slice(1, -1).trim();

  let salience = null;
  const sal = raw.match(/(?:salience|strength)\s*[:=]?\s*([01]?\.?\d+)/i)
    || raw.match(/^\s*\[\s*([01]?\.?\d+)\s*\]/)
    || raw.match(/^\s*([01]?\.?\d+)\s*[|:–-]\s/);
  if (sal) {
    const n = parseFloat(sal[1]);
    if (Number.isFinite(n)) salience = Math.max(0, Math.min(1, n));
  }

  let body = raw
    .replace(/(?:salience|strength)\s*[:=]?\s*[01]?\.?\d+\s*[:|–-]?\s*/i, "")
    .replace(/^\s*\[\s*[01]?\.?\d+\s*\]\s*/, "")
    .replace(/^\s*[01]?\.?\d+\s*[|:–-]\s*/, "")
    .replace(/^\s*(?:PROMPT|IMAGE|VISUAL|DRAW|MAKE)\s*[:–-]\s*/im, "")
    .trim();

  if (/^["']?none\b/i.test(body)) return { prompt: null, salience: salience ?? 0, reason: "none" };
  body = body.replace(/^["']|["']$/g, "").trim();
  if (!body) return { prompt: null, salience: salience ?? 0, reason: "none" };
  return { prompt: body, salience, reason: "image" };
}

/**
 * Pulls out a prompt the MIND wrote out loud in its own thinking — the "the mind
 * decided to think out a new prompt, the hand implements it" path. The mind's
 * out-loud prompt is a line that names itself as an image/picture prompt and
 * carries the picture's content; we take the quoted text, or the rest of the
 * line, as the prompt. Returns null when nothing explicit is present, or when
 * the only explicit prompt is the one we already drew (a re-read of the tail
 * must not re-fire the same picture).
 */
export function explicitImagePrompt(window, lastPrompt) {
  const lines = (window || "").split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!/^(?:image|picture|chart|drawing)\s+prompt\s*[:—-]/i.test(line)) continue;
    const m = line.match(/^image\s+prompt\s*[:—-]\s*(.*)$/i)
      || line.match(/^(?:picture|chart|drawing)\s+prompt\s*[:—-]\s*(.*)$/i);
    let p = (m?.[1] || "").trim();
    if (!p) continue;
    const q = p.match(/^["'`]([\s\S]+?)["'`]$/);
    if (q) p = q[1].trim();
    p = p.replace(/^["'`]|["'`]$/g, "").trim();
    if (p.length < 24) continue;
    if (lastPrompt && p === lastPrompt.trim()) continue;
    return p;
  }
  return null;
}

/**
 * The visual imagination: an observer that turns the mind's recent thinking into
 * an image, generates it, and publishes it.
 *
 * Two paths to a picture, in priority order:
 *   1. The mind wrote a prompt OUT LOUD in its thinking ("image prompt: …") —
 *      the hand implements it (explicitImagePrompt).
 *   2. The mind is just thinking about the state of the market, and something
 *      genuinely NEW wants to be seen — the gate says so, and the composer
 *      writes the prompt FROM THE THINKING (never from raw data files).
 *
 * The gate is a System-One choice (the judge role, e.g. Jev) when the resolved
 * judge is a decision provider — "prompt" / "new-state" / "none" — comparing
 * the current thinking against the prompt of the last picture drawn, so a
 * standing state is not re-drawn every burst. When the judge is a completion
 * model the legacy completion gate (parseImageDecision) runs instead.
 *
 * Attributes:
 *   - every: completed burst cadence for visual checks (default 8)
 *   - threshold: min salience/confidence to generate (default 0.68)
 *   - cooldown: min time between images (default "5m")
 *   - window: chars of stream kept for the gate/composer (default 1600)
 *   - decisionModel: model for the legacy completion gate (default ancestor utilityModel)
 *   - gateModel: model for the System-One gate (default the judge role)
 *   - model: OpenAI image model (default OPENAI_IMAGE_MODEL or gpt-image-1)
 *   - size: image size (default OPENAI_IMAGE_SIZE or 1024x1024)
 *   - quality/background/outputFormat: optional OpenAI image parameters
 *   - style: appended to every prompt as "Style: …"
 *   - maxImages: hard cap on images per run (default 0 = unlimited)
 *
 * Topics published:
 *   - "impulse": {salience, prompt, accepted, reason}
 *   - "generating": boolean
 *   - "generated": {prompt, originalPrompt, dataUrl, url, mimeType, model, size, at}
 *   - "error": {message, prompt}
 */
export class MImage extends MObserver {
  _boundaryCount = 0;
  _busy = false;
  _generating = false;
  _lastGeneratedAt = 0;
  _lastPrompt = null;
  _imagesMade = 0;
  _mindIdentity = null;

  onObserverConnect() {
    // Who the mind is, from its retained `identity` topic (never getPrompt() on it).
    this.sub("!scope/identity", id => { this._mindIdentity = id || null; }).catch(() => {});
  }

  async onBoundary(boundary) {
    if (boundary?.reason !== "completed") return;
    if (this._busy || this._generating) return;

    this._boundaryCount += 1;
    const every = Number(this.attr("every") || 8);
    if (this._boundaryCount % every !== 0) return;
    if (this.window.length < 240) return;

    const maxImages = Number(this.attr("maxImages") || 0);
    if (maxImages && this._imagesMade >= maxImages) return;

    const cooldownMs = parseTime(this.attr("cooldown") || "5m");
    if (Date.now() - this._lastGeneratedAt < cooldownMs) return;

    this._busy = true;
    try {
      const decision = await this._decide();
      if (decision) await this._generate(decision);
    } catch (error) {
      log.warn("Image turn failed:", error.message || error);
    } finally {
      this._busy = false;
    }
  }

  /** The gate. Returns { prompt, salience } when a picture should be made, else null. */
  async _decide() {
    // Path 1: the mind wrote the prompt out loud — implement it, no gate needed.
    const explicit = explicitImagePrompt(this.window, this._lastPrompt);
    if (explicit) {
      this._impulse(1, explicit, "out-loud prompt");
      return { prompt: explicit, salience: 1 };
    }

    // Path 2: the gate. The gate follows the PROFILE's judge binding (resolveModelRef
    // on the "judge" role): under local-voice-jev that is TypeSafe's Jev (a decision
    // provider) → the System-One choice gate, a yes/no the composer then turns into a
    // prompt; under an all-local profile it is a completion model → the legacy gate, which
    // writes the prompt itself (the original mImage path). This is deliberate, per the
    // models.yaml privacy note: binding the judge to the decision provider is a profile
    // decision, never a default — so the mind's thinking only leaves the box to be gated
    // when the profile has already chosen that. A gateModel="jev" attr forces the
    // System-One path regardless of profile.
    let salience = 0;
    let prompt = null;
    let wantPicture = false;
    try {
      const gateModel = resolveModelRef(this.attr("gateModel") || "judge", "judge");
      if (gateModel?.kind === "decision") {
        const g = await this._gateDecision(gateModel);   // { salience } | null — no text
        wantPicture = !!g; salience = g?.salience || 0;
      } else {
        const g = await this._gateLegacy();              // { prompt, salience } | null — writes the prompt
        wantPicture = !!g; salience = g?.salience || 0; prompt = g?.prompt || null;
      }
    } catch (error) {
      log.warn("Image gate failed:", error.message || error);
    }
    if (!wantPicture) { this._impulse(salience, null, "nothing new to see"); return null; }

    const threshold = Number(this.attr("threshold") || 0.68);
    if (salience < threshold) { this._impulse(salience, null, `below ${threshold.toFixed(2)}`); return null; }

    // The System-One gate is a yes/no and cannot write the picture: the composer does,
    // from the thinking. The legacy gate already wrote it, so use it as-is.
    if (!prompt) {
      prompt = await this._compose();
      if (!prompt) { this._impulse(salience, null, "composer found no picture"); return null; }
    }
    this._impulse(salience, prompt, "generate");
    return { prompt, salience };
  }

  _impulse(salience, prompt, reason) {
    this.pub("impulse", {
      salience,
      prompt: prompt ? prompt.slice(0, 500) : null,
      accepted: !!prompt,
      reason,
    });
  }

  /** The System-One gate: does the current thinking carry a picture worth drawing?
   *  Returns { salience } when a picture is wanted (the composer then writes it),
   *  else null. */
  async _gateDecision(model) {
    const result = await decide({
      model,
      state: {
        thinking: `…${this.window.slice(-2400)}`,
        lastPrompt: this._lastPrompt || "(no picture has been drawn yet)",
      },
      questions: { picture: {
        type: "choice",
        instructions: "The mind is thinking about the market. Decide whether a picture should be drawn NOW. "
          + "Choose 'yes' when the thinking carries a state of the market worth a chart-and-text picture that is "
          + "NOT already the state the last picture showed — a move, a turn, a standout, a breadth shift, or a "
          + "headline that lands on the numbers. Choose 'no' when the thinking is the same state the last picture "
          + "already captured, or when nothing visual is at stake.",
        criteria: {
          yes: "A materially new market state, not yet drawn, wants to be seen. (Or no picture has been drawn yet and there is a clear market state.)",
          no: "Nothing new worth a picture; the state is unchanged or there is no visual stake.",
        },
      } },
      debugTag: "image-gate",
      debugEl: this,
    });
    if (!result) return null;
    const { value, confidence } = readChoice(result.answers?.picture);
    if (value !== "yes") return null;
    return { salience: confidence || 0.7 };
  }

  /** The legacy completion gate (the judge is a completion model). */
  async _gateLegacy() {
    const model = resolveModelRef(this.attr("decisionModel") || this.env("utilityModel"), "utility");
    const result = await complete({
      model,
      maxTokens: 180,
      temperature: 0.6,
      prompt: this._decisionPrompt(),
      debugTag: "image-impulse",
      debugEl: this,
    });
    const parsed = parseImageDecision((result.text || "").trim());
    const salience = parsed.salience != null ? parsed.salience : 0.55;
    return parsed.prompt ? { prompt: parsed.prompt, salience } : null;
  }

  /** The composer: writes the chart-and-text prompt FROM THE THINKING. */
  async _compose() {
    const model = resolveModelRef(this.attr("decisionModel") || this.env("utilityModel"), "utility");
    const result = await complete({
      model,
      maxTokens: 320,
      temperature: 0.4,
      prompt: this._composerPrompt(),
      debugTag: "image-compose",
      debugEl: this,
    });
    const text = (result.text || "").trim();
    if (!text) return null;
    if (/^["']?none\b/i.test(text)) return null;
    return text.replace(/^["'`]|["'`]$/g, "").trim() || null;
  }

  async _generate(decision) {
    this._generating = true;
    this._lastGeneratedAt = Date.now();
    this.pub("generating", true);

    const prompt = this._imagePrompt(decision.prompt);
    try {
      const image = await generateImage({
        prompt,
        model: this.attr("model") || undefined,
        size: this.attr("size") || undefined,
        quality: this.attr("quality") || undefined,
        background: this.attr("background") || undefined,
        outputFormat: this.attr("outputFormat") || undefined,
        debugTag: "image-generate",
        debugEl: this,
      });
      this._imagesMade += 1;
      this._lastPrompt = prompt;
      const payload = {
        prompt,
        originalPrompt: decision.prompt,
        revisedPrompt: image.revisedPrompt,
        dataUrl: image.dataUrl,
        url: image.url,
        mimeType: image.mimeType,
        model: image.model,
        size: image.size,
        salience: decision.salience,
        at: new Date().toISOString(),
      };
      this.pub("generated", payload);
      log.info(`generated image (${image.model}, ${image.size}): ${prompt.slice(0, 120)}`);
    } catch (error) {
      this.pub("error", { message: error.message || String(error), prompt });
      throw error;
    } finally {
      this._generating = false;
      this.pub("generating", false);
    }
  }

  _imagePrompt(prompt) {
    const style = (this.attr("style") || "").trim();
    const base = prompt.trim();
    return style ? `${base}\n\nStyle: ${style}` : base;
  }

  _composerPrompt() {
    return `The mind's recent thinking, about the market:
<thinking>
…${this.window.slice(-2400)}
</thinking>

Turn the CURRENT state of the market in that thinking into ONE self-contained image prompt for a chart-and-text picture: the field's breadth, the standout movers, and any headline that lands on the numbers. Use the EXACT figures the thinking states (prices, percent moves, volumes); short labels; a clean, legible data visualization with the numbers visible in the image. Do not invent any number the thinking does not state. Do not restate the last picture: capture what is now true.

Reply with the image prompt only — no preamble, no quotes, at most 450 characters. If the thinking carries no market state worth a picture, reply NONE.`;
  }

  _decisionPrompt() {
    const identity = (this._mindIdentity?.self || "").slice(0, 1000);
    return `You are the visual imagination of a mind. It mostly thinks in words, but sometimes a recent thought becomes vivid enough to deserve an image.

Do not illustrate every topic. Generate an image only when there is a concrete scene, object, texture, face, landscape, room, creature, diagram, or visual metaphor that would deepen the mind's continuity. Prefer one specific image over a collage.

${identity ? `About the mind:\n${identity}\n\n` : ""}Recent stream:
<stream>
…${this.window.slice(-1400)}
</stream>

Reply with ONE of:
- a concise image prompt, optionally beginning with a strength like "[0.8] …"
- or the single word NONE, if nothing genuinely visual wants to be made.`;
  }
}
