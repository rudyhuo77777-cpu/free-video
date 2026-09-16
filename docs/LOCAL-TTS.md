# Local TTS — v0.2.2

The preferred desktop path remains local Supertonic 3, voice **F5**, language **id**.

```text
AURIA browser
→ POST /pair to 127.0.0.1:8787
→ allowed Origin receives restart-scoped token
→ POST /tts with Bearer token
→ Supertonic F5 --lang id
→ WAV
→ Mediabunny AAC track
→ local MP4
```

Security:
- localhost bind only
- no wildcard CORS
- explicit allowed origins
- pairing token required
- one active synthesis by default
- F5/id hard lock in the bridge

Start on Windows:

```powershell
.\START-VOICE-BRIDGE-WINDOWS.ps1
```

Browser Voice Pack remains a future optional download; the large model must not block first visit/PWA install.
