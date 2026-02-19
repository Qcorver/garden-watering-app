DROP INDEX IF EXISTS push_devices_user_id_idx;
DROP INDEX IF EXISTS push_devices_push_token_idx;
ALTER TABLE push_devices DROP CONSTRAINT IF EXISTS push_devices_fcm_token_key;
