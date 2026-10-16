CREATE UNIQUE INDEX factions_name_unique ON factions(lower(trim(name)));
