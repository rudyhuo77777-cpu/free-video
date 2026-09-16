# Free Video v0.3.1 Lite

This is the lightweight Cloudflare deployment build of Free Video.

## What was removed

Railway, Docker, Postgres, Redis, BullMQ, the separate AI Worker service, queue polling, database migration scripts and cloud video rendering are removed.

## What remains

- Existing Free Video UI and local browser video renderer.
- 15/30/60/90/120 second local MP4 rendering.
- One Cloudflare Worker for API routes.
- Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct-fast`) for Director JSON. No external AI API key is required.
- One Cloudflare D1 binding for the 3-free-script quota, Product Projects, idempotency and FYP handoff state.
- Wikimedia Commons + Openverse as keyless media sources.
- Optional Pixabay/Pexels keys for more stock video.
- Optional Windows localhost Supertonic F5 voice bridge.

## Production shape

Browser/PWA → Cloudflare static assets + one Worker → Workers AI / D1 / public media APIs → browser local render → MP4.

There is no Redis, no queue and no Postgres service to keep running.

## Cloudflare Git deployment

The repository root is the Worker project.

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Production branch: `main`

`wrangler.jsonc` already declares the static assets, Workers AI binding and D1 binding. Current Wrangler automatically provisions the draft D1 binding on first deploy, so there is no database ID to paste before the first deployment.

After the first successful deployment, add the custom domain `freevideo.eco-velo.com` in Cloudflare.

## Optional media keys

Without any key the app still uses Wikimedia Commons and Openverse. If needed later, add Worker runtime secrets named:

- `PIXABAY_API_KEY`
- `PEXELS_API_KEY`

## Windows local voice

`START-VOICE-BRIDGE-WINDOWS.ps1` remains optional. The base website can deploy without it. The browser renderer stays local and does not use a cloud video-generation service.

## Production hardening in v0.3.1

- Keeps the existing UI byte-for-byte unchanged.
- Pins Wrangler to 4.131.1 for repeatable Cloudflare builds.
- Restores GET `/api/scripts/jobs/:id` compatibility for the existing client polling path.
- Adds a D1-backed per-IP daily AI request cap without extra services.
- Supports Turnstile verification automatically if `TURNSTILE_SECRET_KEY` and the existing `NEXT_PUBLIC_TURNSTILE_SITE_KEY` are configured; it remains optional for the zero-setup launch.
