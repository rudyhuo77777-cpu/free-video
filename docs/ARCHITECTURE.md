# Free Video Cloudflare Lite Architecture

The production path is intentionally small:

1. Next.js builds the existing UI as static assets.
2. One Cloudflare Worker serves `/api/*` and the static site.
3. Cloudflare Workers AI returns Director JSON synchronously.
4. Cloudflare D1 stores the 3-free-script quota, idempotency ledger, Product Projects and short-lived FYP handoff records.
5. Wikimedia Commons and Openverse provide keyless media search. Pixabay/Pexels are optional.
6. The browser/device performs the actual 15–120 second MP4 render.
7. Windows Supertonic F5 remains an optional localhost voice bridge.

Removed: Railway, Docker, Postgres, Redis, BullMQ, separate AI worker, queue polling, server-side video rendering.
