# Shared audio for narrated clips (#424)

Generated once with ElevenLabs on 2026-10-13 and approved by the owner in the proof of concept. Reuse these in every video instead of generating new ones, so the clips sound the same and no credits are spent per video.

| File | What it is |
|---|---|
| `bumper-gym-hype.mp3` | 12 s gym hype bumper (128 BPM). Intro uses the start, outro the clean ending. |
| `sfx-tap.mp3` | Soft bubbly tap, for every tap in a clip (about 35% volume). |
| `sfx-whoosh.mp3` | Whoosh for the intro card's slide-ins and zoom-out. |
| `sfx-chime.mp3` | Two-note chime as the outro card appears. |

There's no shared spoken line: each video opens with its own short setup line (what you'll learn and why), spoken over the app's first screen, held still, after the bumper.

`lines/` holds each narrated line's audio, cached by `narration.mjs` under a hash of its text, voice, model, and settings, so re-recording a clip only calls ElevenLabs for a new or reworded line. Don't edit these by hand; change the line in `guide-clips.mjs` and re-run it.
