import { MObserver } from "./mObserver.js";
import { complete, generateImage } from "../modelAccess/llm.js";
import { resolveModelRef } from "../modelAccess/modelConfig.js";
import { parseTime } from "../config/timeParser.js";
import { logger } from "../infrastructure/logger.js";

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
 * The visual imagination: an observer that occasionally turns the recent stream
 * into an image prompt, generates an image through OpenAI, and publishes the
 * prompt/image as Amanita topics.
 *
 * Attributes:
 *   - every: completed burst cadence for visual checks (default 8)
 *   - threshold: min salience to generate (default 0.68)
 *   - cooldown: min time between images (default "5m")
 *   - decisionModel: model for the prompt impulse (defaults to ancestor utilityModel)
 *   - model: OpenAI image model (default OPENAI_IMAGE_MODEL or gpt-image-1)
 *   - size: image size (default OPENAI_IMAGE_SIZE or 1024x1024)
 *   - quality/background/outputFormat: optional OpenAI image parameters
 *
 * Topics published:
 *   - "impulse": {salience, prompt, accepted, reason}
 *   - "generating": boolean
 *   - "generated": {prompt, revisedPrompt, dataUrl, url, mimeType, model, size, at}
 *   - "error": {message, prompt}
 */
export class MImage extends MObserver {
  _boundaryCount = 0;
  _busy = false;
  _generating = false;
  _lastGeneratedAt = 0;

  async onBoundary(boundary) {
    if (boundary?.reason !== "completed") return;
    if (this._busy || this._generating) return;

    this._boundaryCount += 1;
    const every = Number(this.attr("every") || 8);
    if (this._boundaryCount % every !== 0) return;
    if (this.window.length < 240) return;

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

  async _decide() {
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
    const threshold = Number(this.attr("threshold") || 0.68);
    const salience = parsed.salience != null ? parsed.salience : 0.55;
    const accepted = !!parsed.prompt && salience >= threshold;

    this.pub("impulse", {
      salience,
      prompt: parsed.prompt ? parsed.prompt.slice(0, 500) : null,
      accepted,
      reason: parsed.prompt ? (accepted ? "generate" : `below ${threshold.toFixed(2)}`) : "nothing visual",
    });
    return accepted ? { salience, prompt: parsed.prompt } : null;
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

  _decisionPrompt() {
    const mind = this.closest("m-mind");
    const identity = mind?.getPrompt ? mind.getPrompt().trim().slice(0, 1000) : "";
    return `You are the visual imagination of a mind. It mostly thinks in words, but sometimes a recent thought becomes vivid enough to deserve an image.

Do not illustrate every topic. Generate an image only when there is a concrete scene, object, texture, face, landscape, room, creature, diagram, or visual metaphor that would deepen the mind's continuity. Prefer one specific image over a collage. Avoid text in the image unless the thought explicitly needs visible writing.

${identity ? `About the mind:\n${identity}\n\n` : ""}Recent stream:
<stream>
…${this.window.slice(-1400)}
</stream>

Reply with ONE of:
- a concise image prompt, optionally beginning with a strength like "[0.8] …"
- or the single word NONE, if nothing genuinely visual wants to be made.`;
  }
}
