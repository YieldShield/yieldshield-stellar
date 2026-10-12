# Stellar video delivery — 12 October 2026

- Review video: `exports/yieldshield-stellar-demo.mp4` — 1:56, 1280×720, 25 fps, H.264/AAC, 5,472,290 bytes.
- Separate captions: `exports/yieldshield-stellar-demo.srt` — 23 cues; captions are also burned into the video.
- ElevenLabs voice source: `narration.mp3` — 1:53.16, Chris – Charming, Down-to-Earth, Eleven v4. Created in the user's signed-in Chrome session using the saved script. No cloned founder voice was used.
- Editable ElevenLabs source: https://elevenlabs.io/app/studio/FSJALjzZ1q7lmKpg11NI — saved as “YieldShield Stellar — narration and captions”. This project contains the voiceover and caption timeline; the finished video is the local MP4, not the Studio canvas.
- Source proof: `elevenlabs-source.png`.
- Reproduction: `render_video.py` uses FFmpeg (directly through `FFMPEG` or from the standard `imageio-ffmpeg` package), the committed captures, narration and caption timings. It does not call ElevenLabs or perform wallet actions. Temporary renders are ignored.

## Verification

- Decoded all 2,900 output frames and the complete audio stream without errors.
- Inspected all eight scenes for readable text, accurate screen content, visible amounts, and safe caption placement. Normalized image/video color ranges to avoid a color shift between screenshot and title-card scenes.
- Confirmed the joined 23-caption transcript matches the narration source exactly after whitespace normalization. Cue timing was read from the visible ElevenLabs timeline, using its 15-second ruler and cue positions, rounded to 10 ms for export.
- Confirmed no caption timing overlaps, no missing ending, and a roughly 2.9-second closing hold after the narration. Captions finish at 1:53.12.
- Audio contains a non-silent signal with maximum decoded level −1.3 dBFS and mean −17.7 dBFS after normalization. This is a technical audio check; a human listening review of name pronunciations has not been claimed.
- Product footage consists of real captured interfaces with gentle pans. The video does not show or imply a completed wallet transaction. Screens are explicitly marked Testnet and the narrator is explicitly identified as AI narration.

## Review and submission state

Both applications remain unsubmitted and held for David's review. No public share link was created. The current Avalanche application and Stellar interest form do not require a video. This Stellar presentation is prepared as supporting material for the later proposal; see `REQUIREMENTS.md` for the checked official guidance. Existing application drafts still need reconciliation with the expanded release before any submission.

The video files are documentation assets excluded from Vercel uploads; no application redeployment is necessary for this delivery.

## File integrity

- MP4 SHA-256: `3f361bf0aa9160993e84d081a75979af0687d4541dc84e3ef57c36479d885783`
- Narration SHA-256: `e06005babde85fbb9e3371ff3224431ca921b8d4c79f61bad2ed1ecaa7e122c1`
