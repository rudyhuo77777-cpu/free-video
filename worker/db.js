// All quota/state transitions use conditional SQL inside a D1 transaction.
// No request performs DDL. See migrations/0001_core.sql and 0002_atomic_jobs.sql.
const readyAt = new WeakMap();
export const LEASE_MS = 180000; // Above the maximum AI time budget (120 seconds).
const SCHEMA_PROBE = `SELECT g.guest_id,g.used,g.updated_at,
 r.idempotency_key,r.guest_id,r.status,r.result_json,r.created_at,r.updated_at,
 r.request_hash,r.lease_token,r.lease_expires_at,r.quota_charged,r.error_code,r.attempts,
 p.id,p.guest_id,p.name,p.price,p.sku,p.target_audience,p.selling_points,p.pain_points,p.created_at,p.updated_at,
 l.bucket,l.count,l.expires_at,b.token,b.guest_id,b.expires_at,
 h.token,h.guest_id,h.payload_json,h.expires_at,h.consumed
 FROM guest_quota g,script_requests r,product_projects p,rate_limits l,fyp_bindings b,fyp_handoffs h WHERE 0`;
const INDEXES = ['idx_script_guest','idx_projects_guest','idx_script_leases'];

export async function ensureSchema(db, force = false) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') {
    throw Object.assign(new Error('database_binding_unavailable'), { stage: 'd1_schema' });
  }
  // Cache ONLY a completed timestamp, not an in-flight I/O promise across Worker invocations.
  if (!force && Date.now() - (readyAt.get(db) || 0) < 10000) return;
  try {
    await db.prepare(SCHEMA_PROBE).all();
    const indexes = await db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_script_guest','idx_projects_guest','idx_script_leases')").all();
    if (INDEXES.some(x => !indexes.results?.some(row => row.name === x))) throw new Error('missing_indexes');
    readyAt.set(db, Date.now());
  } catch (cause) {
    readyAt.delete(db);
    throw Object.assign(new Error('database_not_initialized'), { stage: 'd1_schema', cause });
  }
}

export function boundedInt(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? Math.min(max, Math.floor(n)) : fallback;
}

export async function allowRate(db, bucket, limit, windowSeconds) {
  const cap = boundedInt(limit, 10, 1, 10000);
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + boundedInt(windowSeconds, 90, 1, 172800);
  const row = await db.prepare(`INSERT INTO rate_limits(bucket,count,expires_at) VALUES(?1,1,?2)
    ON CONFLICT(bucket) DO UPDATE SET
      count=CASE WHEN rate_limits.expires_at<=?3 THEN 1 ELSE rate_limits.count+1 END,
      expires_at=CASE WHEN rate_limits.expires_at<=?3 THEN excluded.expires_at ELSE rate_limits.expires_at END
    WHERE rate_limits.expires_at<=?3 OR rate_limits.count<?4
    RETURNING count`).bind(bucket, expiry, now, cap).first();
  return Boolean(row);
}

export async function quota(db, guestId, limit) {
  const row = await db.prepare('SELECT used FROM guest_quota WHERE guest_id=?1').bind(guestId).first();
  const used = Math.max(0, Number(row?.used || 0));
  return { used, remaining: Math.max(0, limit - used), limit };
}

export async function getJob(db, guestId, key) {
  const row = await db.prepare('SELECT * FROM script_requests WHERE idempotency_key=?1').bind(key).first();
  if (row && row.guest_id !== guestId) throw Object.assign(new Error('not_found'), { status: 404 });
  return row;
}

// Run on the next quota/job request. Recovery works after process crashes or client disconnects.
// Expired attempts lose their fencing token; late AI completions cannot write or refund a new attempt.
export async function recoverExpired(db, guestId, now = Date.now()) {
  await db.batch([
    db.prepare(`UPDATE guest_quota SET used=MAX(0,used-(SELECT COUNT(*) FROM script_requests
      WHERE guest_id=?1 AND status='reserved' AND quota_charged=1 AND lease_expires_at<=?2)),updated_at=?2
      WHERE guest_id=?1 AND EXISTS(SELECT 1 FROM script_requests
        WHERE guest_id=?1 AND status='reserved' AND lease_expires_at<=?2)`)
      .bind(guestId, now),
    db.prepare(`UPDATE script_requests SET status='expired',quota_charged=0,lease_token=NULL,
      lease_expires_at=0,error_code='attempt_expired',updated_at=?2
      WHERE guest_id=?1 AND status='reserved' AND lease_expires_at<=?2`).bind(guestId, now)
  ]);
}

// Insertion/retry and debit are one transaction, not separate fallible operations.
export async function reserveJob(db, guestId, key, requestHash, limit, now = Date.now()) {
  const token = crypto.randomUUID();
  const output = await db.batch([
    db.prepare('INSERT OR IGNORE INTO guest_quota(guest_id,used,updated_at) VALUES(?1,0,?2)').bind(guestId, now),
    db.prepare(`INSERT INTO script_requests(idempotency_key,guest_id,status,result_json,created_at,updated_at,
      request_hash,lease_token,lease_expires_at,quota_charged,error_code,attempts)
      SELECT ?1,?2,'reserved',NULL,?3,?3,?4,?5,?6,0,NULL,1 FROM guest_quota WHERE guest_id=?2 AND used<?7
      ON CONFLICT(idempotency_key) DO UPDATE SET
        status='reserved',result_json=NULL,updated_at=excluded.updated_at,
        request_hash=excluded.request_hash,lease_token=excluded.lease_token,
        lease_expires_at=excluded.lease_expires_at,error_code=NULL,attempts=script_requests.attempts+1
      WHERE script_requests.guest_id=excluded.guest_id AND script_requests.status IN ('failed','expired')
        AND script_requests.quota_charged=0
        AND (script_requests.request_hash IS NULL OR script_requests.request_hash=excluded.request_hash)`)
      .bind(key, guestId, now, requestHash, token, now + LEASE_MS, limit),
    db.prepare(`UPDATE guest_quota SET used=used+1,updated_at=?4 WHERE guest_id=?1
      AND EXISTS(SELECT 1 FROM script_requests WHERE idempotency_key=?2 AND guest_id=?1
        AND status='reserved' AND lease_token=?3 AND quota_charged=0)`)
      .bind(guestId, key, token, now),
    db.prepare(`UPDATE script_requests SET quota_charged=1 WHERE idempotency_key=?1
      AND guest_id=?2 AND status='reserved' AND lease_token=?3 AND quota_charged=0`).bind(key, guestId, token),
    db.prepare('SELECT * FROM script_requests WHERE idempotency_key=?1 AND guest_id=?2').bind(key, guestId)
  ]);
  const row = output[4]?.results?.[0] || null;
  return { acquired: row?.status === 'reserved' && row?.lease_token === token && Number(row.quota_charged) === 1, token, row };
}

export async function completeJob(db, guestId, key, token, director, now = Date.now()) {
  const row = await db.prepare(`UPDATE script_requests SET status='completed',result_json=?4,
      updated_at=?5,lease_token=NULL,lease_expires_at=0,error_code=NULL
    WHERE idempotency_key=?1 AND guest_id=?2 AND status='reserved' AND lease_token=?3
      AND quota_charged=1 AND lease_expires_at>?5 RETURNING idempotency_key`)
    .bind(key, guestId, token, JSON.stringify(director), now).first();
  return Boolean(row);
}

export async function failJob(db, guestId, key, token, reason, now = Date.now()) {
  // A rollback leaves the reserved row AND debit intact, recoverable by its lease.
  // A repeated call or a completed/expired/newer attempt cannot double-refund.
  await db.batch([
    db.prepare(`UPDATE guest_quota SET used=CASE WHEN used>0 THEN used-1 ELSE 0 END,updated_at=?4
      WHERE guest_id=?1 AND EXISTS(SELECT 1 FROM script_requests WHERE idempotency_key=?2
        AND guest_id=?1 AND status='reserved' AND lease_token=?3 AND quota_charged=1)`)
      .bind(guestId, key, token, now),
    db.prepare(`UPDATE script_requests SET status='failed',quota_charged=0,lease_token=NULL,
      lease_expires_at=0,error_code=?4,updated_at=?5
      WHERE idempotency_key=?1 AND guest_id=?2 AND status='reserved' AND lease_token=?3`)
      .bind(key, guestId, token, reason, now)
  ]);
}
