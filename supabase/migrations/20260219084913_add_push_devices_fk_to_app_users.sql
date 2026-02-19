-- Remove any orphaned push_devices rows before adding the constraint
DELETE FROM push_devices
WHERE user_id NOT IN (SELECT id FROM app_users);

ALTER TABLE push_devices
  ADD CONSTRAINT push_devices_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE;
