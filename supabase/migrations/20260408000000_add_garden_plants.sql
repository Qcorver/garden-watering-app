-- garden_plants: stores each user's garden plants with pruning schedule
CREATE TABLE IF NOT EXISTS garden_plants (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  perenual_id   INTEGER,
  common_name   TEXT        NOT NULL,
  scientific_name TEXT,
  pruning_months  TEXT[]    NOT NULL DEFAULT '{}',
  image_url     TEXT,
  sunlight      TEXT[]      NOT NULL DEFAULT '{}',
  cycle         TEXT,
  maintenance   TEXT,
  light_condition TEXT      NOT NULL DEFAULT 'sun',
  in_pot        BOOLEAN     NOT NULL DEFAULT false,
  description   TEXT,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per user+species (prevents duplicates)
CREATE UNIQUE INDEX garden_plants_user_perenual_idx
  ON garden_plants (user_id, perenual_id)
  WHERE perenual_id IS NOT NULL;

-- RLS
ALTER TABLE garden_plants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own garden plants"
  ON garden_plants
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
