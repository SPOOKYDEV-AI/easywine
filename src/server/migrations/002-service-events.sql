
-- v2: record which wines were displayed and which one was actually chosen.
-- We deliberately do not store guest identity or their preference selections.
CREATE TABLE service_sessions (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  dish_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(restaurant_id,id),
  FOREIGN KEY(restaurant_id,dish_id) REFERENCES dishes(restaurant_id,id)
);
CREATE INDEX ix_service_tenant_date ON service_sessions(restaurant_id,created_at);
CREATE TABLE service_options (
  restaurant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  wine_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('classic','recommendation')),
  rank INTEGER,
  score INTEGER,
  PRIMARY KEY(restaurant_id,session_id,wine_id),
  FOREIGN KEY(restaurant_id,session_id) REFERENCES service_sessions(restaurant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(restaurant_id,wine_id) REFERENCES wines(restaurant_id,id)
);
CREATE INDEX ix_service_options_wine ON service_options(restaurant_id,wine_id);
CREATE TABLE service_choices (
  restaurant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  wine_id TEXT NOT NULL,
  chosen_at TEXT NOT NULL,
  PRIMARY KEY(restaurant_id,session_id),
  FOREIGN KEY(restaurant_id,session_id,wine_id)
    REFERENCES service_options(restaurant_id,session_id,wine_id),
  FOREIGN KEY(restaurant_id,session_id) REFERENCES service_sessions(restaurant_id,id) ON DELETE CASCADE
);
CREATE INDEX ix_service_choices_wine ON service_choices(restaurant_id,wine_id);
