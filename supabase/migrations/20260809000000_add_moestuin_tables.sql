-- Moestuin feature: shared crop catalogue + per-user vegetable garden plants
-- crop_species: curated list of NL vegetable-garden crops (seeded via scripts/seed-crops.mjs)
-- moestuin_plants: per-user crops with growth-stage dates, read by push-daily for check-in pushes

CREATE TABLE crop_species (
  id                    SERIAL PRIMARY KEY,
  name_nl               TEXT NOT NULL UNIQUE,
  name_en               TEXT,
  scientific_name       TEXT,
  category              TEXT NOT NULL DEFAULT 'groente', -- groente | kruid | fruit
  emoji                 TEXT,
  sow_indoor_months     TEXT[] NOT NULL DEFAULT '{}',    -- English month names, like plant_species.planting_months
  sow_outdoor_months    TEXT[] NOT NULL DEFAULT '{}',
  plant_out_months      TEXT[] NOT NULL DEFAULT '{}',
  harvest_months        TEXT[] NOT NULL DEFAULT '{}',
  days_to_germinate_min SMALLINT,
  days_to_germinate_max SMALLINT,
  days_to_harvest_min   SMALLINT,                        -- days from sowing to first harvest
  days_to_harvest_max   SMALLINT,
  description_nl        TEXT,
  image_url             TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE crop_species ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read crop_species"
  ON crop_species FOR SELECT USING (true);

GRANT SELECT ON crop_species TO anon;
GRANT SELECT ON crop_species TO authenticated;
GRANT ALL ON crop_species TO service_role;
GRANT USAGE ON SEQUENCE crop_species_id_seq TO service_role;

CREATE TABLE moestuin_plants (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  crop_id            INTEGER REFERENCES crop_species(id),
  common_name        TEXT NOT NULL,                      -- snapshot of crop name (NL) for offline/display
  sown_on            DATE,
  germinated_on      DATE,
  planted_out_on     DATE,
  first_harvest_on   DATE,
  -- check-in push dedupe: which growth stage we last asked about, and when
  last_checkin_stage TEXT,
  last_checkin_sent  DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE moestuin_plants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can manage their own moestuin_plants"
  ON moestuin_plants FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX moestuin_plants_user_id_idx ON moestuin_plants(user_id);

GRANT ALL ON moestuin_plants TO authenticated;
GRANT ALL ON moestuin_plants TO service_role;
