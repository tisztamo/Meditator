# Spoken utterance fragments arrive at word granularity — speech reads choppy

> **Status: diagnosed, no fix yet.** The mind's aloud speech is streamed to the UI
> as individual-word fragments instead of coherent phrases, making each utterance
> appear spliced apart word-by-word. Visible in the Studio UI and in the journal's
> `(aloud)` tail records. Touches the speech voice pipeline
> (`src/mindComponents/mind/mSpeech.js`), the WebSocket broadcast
> (`src/mindComponents/shared/mWs.js`), and the UI consumer
> (`src/studio/ui/studioSpeech.js`, `src/studio/ui/studioConn.js`).

## The problem

When the mind speaks aloud, the utterance is produced as its own streamed LLM burst
in `MSpeech._speak()`. The stream iterates `for await (const text of burst)` and
publishes each fragment immediately:

```
mSpeech._speak()
  → for await (const text of burst)         // mSpeech.js:264
  → this.pub("speech", text)               // mSpeech.js:267 — each fragment
  → mWs instruments:                       // mWs.js:528
  → broadcastToClients({ type: "speech_fragment", data: { content: text } })
  → UI: studioConn fires streamFragment    // studioConn.js:216
  → StudioSpeech.append(text)              // studioSpeech.js:27 — appends to DOM
```

Each `text` yielded by the streaming API can be as small as a single word or even a
few characters — whatever the model's SSE chunk boundaries produce. Because every
fragment is published and broadcast independently, the UI receives and renders speech
at word (or sub-word) granularity. The utterance is correct in its totality, but the
delivery feels spliced: each word appears separately, with the pacing dictated by
network chunk timing rather than natural speech rhythm.

## Why it matters

1. **UI readability.** A spoken passage is meant to read as a coherent utterance —
   the mind's voice to the world. Word-by-word appearance makes it feel mechanical,
   like each token is being announced separately rather than forming a sentence.

2. **Tail record fidelity.** The complete utterance is eventually recorded in the
   tail as `(aloud) "full sentence"` (via `mMemory.spoke()`, triggered by the
   `@spoken` event after the burst completes). The tail is fine. But the *live*
   experience — what the human sees in real time and what tools consuming the
   `speech_fragment` stream observe — is a sequence of atomic words.

3. **Downstream consumers.** Anything listening to `speech_fragment` WebSocket
   messages or the `speech` topic gets the same fragmentation. A voice synthesizer
   (TTS), a logging tool, or a companion UI would all receive word-sized chunks
   rather than phrase-sized ones.

## Root cause

The speech stream in `_speak()` publishes `this.pub("speech", text)` inside the
iteration loop with no buffering, coalescing, or batching. The thinking stream
(`mStream`) has the same raw behavior for `chunk` events, but the difference is in
perception: the thinking stream is expected to flow continuously, and the UI renders
it as a running monologue. Speech, by contrast, is discrete — each utterance is a
bounded event with a beginning and an end, and fragmenting it into words makes each
piece feel like a separate utterance.

The underlying LLM streaming API (`chatStream` in `src/modelAccess/llm.js`) yields
chunks at whatever granularity the provider's SSE stream produces. There is no
application-level control over that granularity, so the burden of coalescing falls
on the consumer.

## Directions to consider (undecided)

1. **Buffer and publish on punctuation / natural breaks.** Accumulate speech
   fragments in `_speak()` and only `pub("speech", …)` when a natural break is
   detected (end of sentence, comma, or a short time window like 200ms of no new
   text). The UI would receive phrase- or sentence-sized fragments instead of
   words. Simplest change; stays local to `mSpeech._speak()`. Risk: adds latency
   to the live display (the last phrase waits for the timer or sentence end).

2. **Batch in the WebSocket layer.** Coalesce `speech` topic publications into
   larger messages before broadcasting (e.g., accumulate for N milliseconds and
   send one combined fragment). Keeps `mSpeech` unchanged; the batching is in
   `mWs._instrument()` or a new middleware. Risk: batches speech with other
   instrumented topics; needs to be speech-specific.

3. **Batch in the UI.** Have `StudioSpeech` or `studioConn` buffer incoming
   `speech_fragment` messages and render them in larger chunks. Pure frontend
   fix; the backend still publishes word fragments. Risk: every consumer needs
   its own buffering logic.

4. **Do nothing — document as known.** If word-granular streaming is acceptable
   (e.g., it creates a "typing effect" some users prefer), just record it as a
   characteristic of the system.

## Evidence

Observable in any Studio session where the mind speaks aloud — the `.say` card
updates word-by-word rather than in phrase-sized increments. The WebSocket traffic
confirms `speech_fragment` messages carry single words or short fragments.
