CREATE TABLE IF NOT EXISTS price_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  depart_date TEXT NOT NULL,
  return_date TEXT NOT NULL,
  cabin TEXT NOT NULL DEFAULT 'ECONOMY',
  adults INTEGER NOT NULL DEFAULT 1,
  price_cny INTEGER NOT NULL,
  provider TEXT NOT NULL,
  observed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_price_observation_fingerprint
  ON price_observations(fingerprint, price_cny, observed_at);

CREATE TABLE IF NOT EXISTS search_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_cache_expiry
  ON search_cache(expires_at);

CREATE TABLE IF NOT EXISTS api_usage (
  usage_key TEXT PRIMARY KEY,
  usage_day TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_api_usage_day ON api_usage(usage_day);
