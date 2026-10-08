
-- v4: optional, fail-closed TOTP 2FA. Secrets are AES-GCM encrypted with
-- EASYWINE_MFA_KEY, which MUST remain outside SQLite and Git.
CREATE TABLE mfa_credentials (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 encrypted_secret TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 pending_expires_at TEXT,
 last_step INTEGER NOT NULL DEFAULT -1,
 created_at TEXT NOT NULL
);
CREATE TABLE mfa_challenges (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 created_at TEXT NOT NULL
);
CREATE INDEX ix_mfa_challenges_expiry ON mfa_challenges(expires_at);
CREATE TABLE mfa_recovery_codes (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 code_hash TEXT NOT NULL,
 PRIMARY KEY(user_id,code_hash)
);
