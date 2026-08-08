CREATE TABLE IF NOT EXISTS wishlist_plants (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  perenual_id INTEGER,
  common_name TEXT NOT NULL,
  scientific_name TEXT,
  planting_months TEXT[] NOT NULL DEFAULT '{}',
  image_url TEXT,
  cycle TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE wishlist_plants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can manage their own wishlist_plants"
  ON wishlist_plants FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS wishlist_plants_user_id_idx ON wishlist_plants(user_id);

GRANT ALL ON wishlist_plants TO authenticated;
GRANT ALL ON wishlist_plants TO service_role;
