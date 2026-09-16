# Cloudflare deployment — shortest path

This v0.3.1 Lite package is designed for one Cloudflare Worker deployment.

1. Push this repository root to `rudyhuo77777-cpu/free-video`.
2. In Workers & Pages, connect that repository.
3. Project name: `free-video`.
4. Build command: `npm run build`.
5. Deploy command: keep the default `npx wrangler deploy`.
6. Click Deploy.
7. Wrangler auto-provisions the draft D1 binding declared in `wrangler.jsonc`; Workers AI is already declared as binding `AI`.
8. After the deployment is healthy, add custom domain `freevideo.eco-velo.com`.

No Railway, Docker, Redis, Postgres, BullMQ, separate AI worker, or external AI API key is required.

Optional later: set runtime secrets `PIXABAY_API_KEY` and/or `PEXELS_API_KEY` for more stock-video sources. Keyless Wikimedia Commons + Openverse remain available without them.
