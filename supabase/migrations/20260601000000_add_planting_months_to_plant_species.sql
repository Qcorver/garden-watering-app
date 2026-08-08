ALTER TABLE plant_species ADD COLUMN IF NOT EXISTS planting_months TEXT[] DEFAULT '{}';
