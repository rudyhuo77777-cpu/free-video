# Architecture / backend contracts v0.3.3

Static Next.js export and all existing browser UI are unchanged. One Cloudflare Worker serves /api/* and the ASSETS binding. Core types/normalizer remain a local package, not a separate hosted service.

## Entry and diagnostics

`handleApi` awaits dispatch inside its error boundary. Cookie decoding and input decoding live inside that boundary. Malformed/null/array/oversized JSON produces controlled errors. Unknown /api paths return JSON404, not HTML. All responses include x-request-id; errors include requestId/stage. No user prompt, cookie, token, secret, or full provider payload is logged in ordinary API error diagnostics.

Liveness /api/health is NOT business readiness. /api/ready checks six application tables, required columns, three indexes and the AI binding, plus known deprecated model configuration; it does not invoke the model. Completed readiness timestamps (10s), not in-flight I/O promises, are cached across calls.

## AI

Default: @cf/meta/llama-3.3-70b-instruct-fp8-fast, with JSON Schema. May 8 2026 official announcement lists this and the 8B -fast variant as remaining active, but the previous non-fast 8B default was deprecated May30. This is documentation evidence, not a successful invocation from this environment.

Complete schema/example is present in every mode, including plain-JSON fallback. Decode and semantic structural validation are both within at most two calls; repair includes the failed output (capped) and validation reason. Empty scenes/voices, wrong metadata, invalid enums/numbers and unreasonable timelines are rejected. Scene IDs are canonicalized without manufacturing text. Existing sanitizer is used only after validation. Language style, factual product truth and ad quality still need output review; structural tests cannot certify them.

There is a single total waiting budget (45s default; at most120s), not two full-length independent timeouts. A timed-out upstream inference cannot be reliably cancelled by Promise.race and may still bill. No new overlapping call is started after timeout. No fake/mock Director fallback exists in production. Test fixtures are only under tests/ and test-only Wrangler entries.

## Quota transaction state

Each request owns a random fencing token and a 180s lease. D1 conditional SQL + batch transaction handles reservation/debit and failure/refund. Completed writes are conditional on the current live token. Display-only remaining quota read never reverses completion. A lost persistence reply yields `persistence_unconfirmed`; retry/polling resolves the durable state rather than blindly refunding. Refund storage failure leaves a charged reserved record for recovery. Expired leases recover on the next relevant request, not by a hidden background worker. Completed rows retain results for idempotent replay; same key + different payload is409, foreign identity404.

This is an anonymous visitor quota, NOT permanent verified user identity: deleting cookies can create a new guest. IP minute/day caps are additional guardrails, not proof of a human account. Optional Turnstile is retained. Fourth script remains402; no billing integration is invented.

Rates use atomic conditional UPSERT RETURNING. FYP binding creation/consumption use conditional transactions/RETURNING so concurrent losers do not receive the one-use payload. SQL runs on D1 primary without opting into read sessions/replicas.

## Media and voice

Existing Commons/Openverse and optional Pixabay/Pexels mapping are kept. Outbound media calls have an8s abort signal; this does not certify CDN CORS/licensing/relevance or that frames entered the actual MP4. Browser rendering stays in original code. No cloud video-generation provider is added.

Voice bridge adds only localhost:8790 and127.0.0.1:8790 origins to existing whitelist. It remains bound to127.0.0.1 and requires pairing for /tts. SupertonicF5 itself and phone TTS are separate device acceptance gates.

## Runtime/deploy isolation

- wrangler.local.jsonc: local Worker + local D1 + real remote AI.
- wrangler.ai-test.jsonc: test-only local Worker + real AI, noDB.
- wrangler.runtime-test.jsonc: test-only local workerd + real localD1 + fixtureAI, no cloud inference.
- wrangler.jsonc: production entry, requires explicit existing DB ID, migrations before deploy.

No production deploy is called by install, verification or local preview. There is no Redis/Postgres/BullMQ/Railway/Docker revival.
