-- Remove orphaned rows from user_preferences and user_location
DELETE FROM user_preferences
WHERE user_id NOT IN (SELECT id FROM app_users);

DELETE FROM user_location
WHERE user_id NOT IN (SELECT id FROM app_users);
