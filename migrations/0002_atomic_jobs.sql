-- Additive upgrade from v0.3.1/v0.3.2. Apply ONCE via Wrangler's migration ledger.
-- 0001 stays byte-for-byte unchanged. No DROP/DELETE; existing project/results survive.
ALTER TABLE script_requests ADD COLUMN request_hash TEXT;
ALTER TABLE script_requests ADD COLUMN lease_token TEXT;
ALTER TABLE script_requests ADD COLUMN lease_expires_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE script_requests ADD COLUMN quota_charged INTEGER NOT NULL DEFAULT 0;
ALTER TABLE script_requests ADD COLUMN error_code TEXT;
ALTER TABLE script_requests ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_script_leases ON script_requests(guest_id,status,lease_expires_at);

-- Establish a counter for legacy rows; never reduce pre-existing usage.
INSERT OR IGNORE INTO guest_quota(guest_id,used,updated_at)
  SELECT guest_id,0,MAX(updated_at) FROM script_requests GROUP BY guest_id;
UPDATE guest_quota SET used=MAX(used,(SELECT COUNT(*) FROM script_requests r
  WHERE r.guest_id=guest_quota.guest_id AND r.status='completed'));
UPDATE script_requests SET quota_charged=1 WHERE status='completed';

-- Allocate only the debit left after completed jobs to legacy reservations.
-- This avoids refunding uncharged rows left between old INSERT and old reserveQuota.
UPDATE script_requests SET quota_charged=1
 WHERE status='reserved' AND
  (SELECT COUNT(*) FROM script_requests s WHERE s.guest_id=script_requests.guest_id
    AND s.status='reserved' AND s.idempotency_key<=script_requests.idempotency_key)
  <= MAX(0,(SELECT used FROM guest_quota g WHERE g.guest_id=script_requests.guest_id)
    -(SELECT COUNT(*) FROM script_requests c WHERE c.guest_id=script_requests.guest_id AND c.status='completed'));
-- Legacy reservations have expiry=0 and are recovered atomically on the next guest request.
-- For the upgrade, do not run old and new writers concurrently. See CLOUDFLARE-DEPLOY.md.
