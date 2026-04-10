-- Shared plant species catalogue (not per-user)
-- Seeded from Perenual API + Wikidata Dutch names

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE plant_species (
  id              SERIAL PRIMARY KEY,
  perenual_id     INTEGER UNIQUE,
  scientific_name TEXT NOT NULL,
  common_name_en  TEXT,
  common_name_nl  TEXT,
  pruning_months  TEXT[]      NOT NULL DEFAULT '{}',
  sunlight        TEXT[]      NOT NULL DEFAULT '{}',
  cycle           TEXT,
  maintenance     TEXT,
  description     TEXT,
  image_url       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigram indexes for fast fuzzy search on names
CREATE INDEX plant_species_en_trgm  ON plant_species USING gin(common_name_en  gin_trgm_ops);
CREATE INDEX plant_species_nl_trgm  ON plant_species USING gin(common_name_nl  gin_trgm_ops);
CREATE INDEX plant_species_sci_trgm ON plant_species USING gin(scientific_name gin_trgm_ops);

-- RLS: anyone can read, only service role can write
ALTER TABLE plant_species ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read plant_species"
  ON plant_species FOR SELECT USING (true);
