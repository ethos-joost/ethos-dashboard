-- Run this in the Supabase SQL editor to set up the schema.

CREATE TABLE IF NOT EXISTS profiles (
  profile_id INT PRIMARY KEY,
  score INT NOT NULL,
  display_name TEXT,
  addresses TEXT[] NOT NULL,
  holdings_usd NUMERIC(18, 2) NOT NULL DEFAULT 0,
  holdings_evm NUMERIC(18, 2) NOT NULL DEFAULT 0,
  holdings_nfts NUMERIC(18, 2) NOT NULL DEFAULT 0,
  holdings_hyperliquid NUMERIC(18, 2) NOT NULL DEFAULT 0,
  -- Ethos engagement fields
  vouch_given_eth NUMERIC(18, 4),
  vouch_given_count INT,
  vouch_received_eth NUMERIC(18, 4),
  vouch_received_count INT,
  reviews_positive INT,
  reviews_neutral INT,
  reviews_negative INT,
  human_verified BOOLEAN,
  xp_total INT,
  influence_factor INT,
  influence_factor_percentile NUMERIC(5, 2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_score ON profiles(score DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_holdings ON profiles(holdings_usd DESC);

-- Simple meta table for tracking ingestion runs
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
