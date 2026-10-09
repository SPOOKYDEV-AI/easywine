-- Version 5. Existing sessions keep absolute expiry and receive one idle window on rollout.
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT '';
UPDATE sessions SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now');
CREATE TABLE recommendation_requests (
 restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 actor_id TEXT NOT NULL REFERENCES users(id),
 request_key TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 response_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(restaurant_id,actor_id,request_key)
);
CREATE INDEX ix_recommendation_requests_age ON recommendation_requests(created_at);
