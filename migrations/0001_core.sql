CREATE TABLE IF NOT EXISTS guest_quota (
  guest_id TEXT PRIMARY KEY,
  used INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS script_requests (
  idempotency_key TEXT PRIMARY KEY,
  guest_id TEXT NOT NULL,
  status TEXT NOT NULL,
  result_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_script_guest ON script_requests(guest_id, created_at DESC);

CREATE TABLE IF NOT EXISTS product_projects (
  id TEXT PRIMARY KEY,
  guest_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price TEXT,
  sku TEXT,
  target_audience TEXT,
  selling_points TEXT NOT NULL DEFAULT '[]',
  pain_points TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_guest ON product_projects(guest_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fyp_bindings (
  token TEXT PRIMARY KEY,
  guest_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fyp_handoffs (
  token TEXT PRIMARY KEY,
  guest_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0
);
