# Voice POC: directed narration on ElevenLabs v3 (#643)

`voice-poc.mjs` renders five real narration lines twice with Jessica: as today
(`eleven_multilingual_v2`, no tags) and on `eleven_v3` with one audio tag in front.
Output goes to `logs/demo-video/voice-poc/` (gitignored, outside the line cache).
Run: `ELEVENLABS_API_KEY=... node scripts/demo-video/voice-poc.mjs`.

On the issue, each pair is one clip: the v2 line, 1.2 seconds of silence, then the v3 line.

| Clip | v3 tag | Line |
|---|---|---|
| ab-routines-setup | `[warmly]` | Doing the same workout every week, like a push day? Save it as a routine, and next time it's ready to go in one tap. No setting it up again. |
| ab-starter-pick | `[friendly]` | Pick the one that fits your week. Let's go with push, pull, legs. |
| ab-basics-setup | `[reassuring]` | New to the gym? Here's what all those words mean, so you can walk in and know what to do. |
| ab-basics-weight | `[leaning in]` | When you're not sure, go lighter. You can always add more next set. |
| ab-routines-home | `[pleased]` | That's it, your routine is saved. Head back to Home. |

## Findings

- **previous_text / next_text: not supported on v3.** The API answers 400
  `unsupported_model`: "Providing previous_text or next_text is not yet supported with the
  'eleven_v3' model." The line cache relies on them for flow between lines, so a v3 switch
  would voice each line cold.
- **Cost per character: the same.** The `character-cost` header was 56/26/36/27/21 on v2 and
  60/30/41/32/25 on v3. The difference is only the tag's own characters (4 to 5 extra each).
- **Same voice?** Same voice ID, so the same base voice. Whether it sounds the same is a
  listening call for the owner; the clips are the test.

Not in scope: switching the model. That changes every line's cache key and re-records them all.
