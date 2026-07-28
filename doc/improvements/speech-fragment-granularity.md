# Spoken utterance rendering is inconsistent — sometimes word-by-word, sometimes one card

> **Status: fixed.** Speech and thought are produced concurrently, but the
> `speaking=true` telemetry is delivered separately from `speech_fragment`.
> When a thought fragment arrived between the first speech fragment and that
> telemetry event, the Studio believed speech had already ended and sealed the
> card. Later speech fragments then opened additional cards.

The Studio now treats the first speech fragment as the start of the active speech
burst. The lifecycle telemetry still closes the card, but an intervening thought
cannot split the burst while the `speaking=true` message is in flight.

## Where to look

- `src/mindComponents/mind/mSpeech.js` — `_speak()`, the speech burst loop
- `src/mindComponents/shared/mWs.js` — `speech_fragment` broadcast
- `src/studio/ui/studioSpeech.js`, `src/studio/ui/studioConn.js` — UI rendering
  of fragments into a card
