# Spoken utterance rendering is inconsistent — sometimes word-by-word, sometimes one card

> **Status: observed, not diagnosed.** In the Studio UI, a spoken utterance
> sometimes streams in word-by-word (each fragment appended separately, choppy),
> and other times appears all at once as a single card. The cause of the
> difference is unknown — it may be that some other event occurring during the
> speech burst triggers the word-by-word path, while an uninterrupted burst
> renders as one card. Needs investigation before any fix is designed.

## Where to look

- `src/mindComponents/mind/mSpeech.js` — `_speak()`, the speech burst loop
- `src/mindComponents/shared/mWs.js` — `speech_fragment` broadcast
- `src/studio/ui/studioSpeech.js`, `src/studio/ui/studioConn.js` — UI rendering
  of fragments into a card
