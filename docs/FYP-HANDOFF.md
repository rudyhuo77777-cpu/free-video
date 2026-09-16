# FYP handoff — Lite

The FYP integration no longer needs Redis.

1. `/api/fyp/start` creates a short-lived random return binding in D1 and redirects to `https://fyp.eco-velo.com`.
2. The FYP service returns its analysis to `/api/fyp/handoff` with that random binding.
3. Free Video converts it to a one-time D1 handoff token.
4. The Video page POSTs that token to `/api/fyp/handoff/consume`.
5. The token is accepted only for the same browser guest identity and is consumed once.
