-- Fix null cycle/maintenance for common garden plants so detectWaterCategory
-- can correctly assign watering categories (trees vs drought vs border).
-- Without this, all plants with null fields fall back to "border".

-- Fruit trees and ornamental trees: deep roots, rarely need watering
UPDATE plant_species
SET cycle = 'tree', maintenance = COALESCE(maintenance, 'Low')
WHERE scientific_name IN (
  'Malus domestica',
  'Prunus cerasus',
  'Prunus avium',
  'Prunus domestica',
  'Pyrus communis',
  'Prunus persica',
  'Prunus armeniaca'
)
AND (cycle IS NULL OR cycle NOT ILIKE '%tree%');

-- Drought-tolerant ground covers / climbers
UPDATE plant_species
SET maintenance = 'Low', cycle = COALESCE(cycle, 'perennial')
WHERE scientific_name IN (
  'Hedera helix',
  'Hedera hibernica',
  'Hedera algeriensis'
)
AND (maintenance IS NULL OR maintenance = '');
