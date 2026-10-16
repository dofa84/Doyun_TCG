CREATE TABLE games (
 id TEXT PRIMARY KEY, creator_user_id TEXT NOT NULL REFERENCES users(id), create_request_id TEXT NOT NULL,
 rules_version TEXT NOT NULL DEFAULT 'family-v1', status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN('waiting','active','finished')),
 version INTEGER NOT NULL DEFAULT 0, turn_number INTEGER NOT NULL DEFAULT 0,
 state_json TEXT CHECK(state_json IS NULL OR length(CAST(state_json AS BLOB))<=262144),
 join_request_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(creator_user_id,create_request_id)
);
CREATE TABLE game_members (
 game_id TEXT NOT NULL REFERENCES games(id), seat INTEGER NOT NULL CHECK(seat IN(0,1)),
 user_id TEXT NOT NULL REFERENCES users(id), faction_id TEXT NOT NULL REFERENCES factions(id),
 PRIMARY KEY(game_id,seat), UNIQUE(game_id,user_id)
);
CREATE INDEX game_members_user ON game_members(user_id,game_id);
CREATE TABLE game_devices (
 token_hash TEXT PRIMARY KEY, game_id TEXT NOT NULL REFERENCES games(id),
 session0 TEXT, session1 TEXT, expires_at INTEGER NOT NULL
);
CREATE INDEX game_devices_game ON game_devices(game_id);
CREATE TABLE game_actions (
 game_id TEXT NOT NULL REFERENCES games(id), request_id TEXT NOT NULL, applied_version INTEGER NOT NULL,
 events_json TEXT NOT NULL, PRIMARY KEY(game_id,request_id), UNIQUE(game_id,applied_version)
);
CREATE TABLE game_images (
 game_id TEXT NOT NULL REFERENCES games(id), image_key TEXT NOT NULL REFERENCES uploads(key),
 PRIMARY KEY(game_id,image_key)
);
CREATE INDEX game_images_key ON game_images(image_key,game_id);
