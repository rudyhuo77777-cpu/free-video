# FYP handoff contract

GET /api/fyp/start creates an identity-bound return token and redirects to configured FYP_URL.
FYP sends POST /api/fyp/handoff with returnBinding, productName, duration, viralHook/directorHints and optional sourceUrl. Only one concurrent creation wins. This is a capability token; do not publish it in logs.
The result returns /video#fyp_token=..., which the unchanged client POSTs to /api/fyp/handoff/consume. Only the owning guest may consume it once. Concurrent loser gets409; foreign/expired gets404. Return binding expires after1800s; handoff after900s.

Server-to-server handoff remains supported. Browser CORS is narrowly allowed only for the configured FYP origin at /api/fyp/handoff; not a general wildcard credential policy. This version does not alter or deploy the external fyp.eco-velo.com service. Its full integration remains a live acceptance item.
