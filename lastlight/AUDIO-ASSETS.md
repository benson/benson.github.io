# Audio cue provenance

Lastlight does not ship or download a third-party sound pack.

The default cue registry is `audio-cues.js` (`lastlight.audio-cues.v1`). Every effect is project-authored data rendered at runtime with the browser Web Audio oscillator and gain APIs. The registry records:

- `source: runtime-generated`
- `license: project-authored`
- `externalAssets: false`

There are no sampled recordings, music tracks, voice clips, or copyrighted game sounds in the default theme. A replacement visual/audio theme can provide another registry with the same strict schema, but its author must document every external file's source URL, creator, license, and modification history before it can ship.

The optional “pew pew pew” callout uses the browser's local speech-synthesis voice. It does not bundle or transmit a voice model or recording, is rate-limited to one unqueued callout every twelve seconds, and can be disabled independently or reduced to zero volume.

The authored mix targets 3 dB of output headroom. Every cue is limited to five oscillators and a conservative 0.24 authored amplitude sum; the runtime reserves twelve of its 42 oscillator slots for damage, hostile, objective, danger, apex, ultimate, and outcome feedback. A compressor, bounded soft-clip stage, and fixed output ceiling protect dense-wave peaks, while low-priority chatter is suppressed before critical feedback.

The oscillator implementation remains the permanent fallback even if a future theme adds licensed local audio files. Missing or failed theme assets must fall back to these generated cues rather than silence.
