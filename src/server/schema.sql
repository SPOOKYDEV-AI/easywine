
CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS restaurants(
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users(
 id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 email TEXT NOT NULL COLLATE NOCASE, name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','manager','staff')),
 salt TEXT NOT NULL, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL, UNIQUE(restaurant_id,email)
);
CREATE TABLE IF NOT EXISTS sessions(
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS wines(
 id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 producer TEXT NOT NULL, cuvee TEXT NOT NULL, appellation TEXT NOT NULL DEFAULT '',
 vintage TEXT NOT NULL DEFAULT '', region TEXT NOT NULL DEFAULT '', grapes TEXT NOT NULL DEFAULT '',
 color TEXT NOT NULL CHECK(color IN ('rouge','blanc','rose','bulles','doux')),
 tags TEXT NOT NULL DEFAULT '[]',
 body INTEGER NOT NULL CHECK(body BETWEEN 1 AND 5),
 acidity INTEGER NOT NULL CHECK(acidity BETWEEN 1 AND 5),
 tannin INTEGER NOT NULL CHECK(tannin BETWEEN 1 AND 5),
 aromatic INTEGER NOT NULL CHECK(aromatic BETWEEN 1 AND 5),
 price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
 stock INTEGER NOT NULL CHECK(stock >= 0),
 by_glass INTEGER NOT NULL DEFAULT 0 CHECK(by_glass IN (0,1)),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL,
 UNIQUE(restaurant_id,id)
);
CREATE INDEX IF NOT EXISTS ix_wines_tenant ON wines(restaurant_id,active,stock);
CREATE TABLE IF NOT EXISTS dishes(
 id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 intensity INTEGER NOT NULL CHECK(intensity BETWEEN 1 AND 5),
 richness INTEGER NOT NULL CHECK(richness BETWEEN 1 AND 5),
 acidity INTEGER NOT NULL CHECK(acidity BETWEEN 1 AND 5),
 aromatic INTEGER NOT NULL CHECK(aromatic BETWEEN 1 AND 5),
 spice INTEGER NOT NULL CHECK(spice BETWEEN 1 AND 5),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 classic_wine_id TEXT,
 version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL,
 UNIQUE(restaurant_id,id),
 FOREIGN KEY(restaurant_id,classic_wine_id) REFERENCES wines(restaurant_id,id)
);
CREATE INDEX IF NOT EXISTS ix_dishes_tenant ON dishes(restaurant_id,active);
CREATE TABLE IF NOT EXISTS blocked_pairings(
 restaurant_id TEXT NOT NULL REFERENCES restaurants(id), dish_id TEXT NOT NULL, wine_id TEXT NOT NULL,
 reason TEXT NOT NULL DEFAULT '',
 PRIMARY KEY(restaurant_id,dish_id,wine_id),
 FOREIGN KEY(restaurant_id,dish_id) REFERENCES dishes(restaurant_id,id),
 FOREIGN KEY(restaurant_id,wine_id) REFERENCES wines(restaurant_id,id)
);
CREATE TABLE IF NOT EXISTS audit(
 id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 actor_id TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL, object_type TEXT NOT NULL, object_id TEXT NOT NULL,
 before_json TEXT, after_json TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_audit_tenant ON audit(restaurant_id,created_at);
INSERT OR IGNORE INTO schema_version(version) VALUES(1);
