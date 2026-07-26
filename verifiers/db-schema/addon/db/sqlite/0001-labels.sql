CREATE TABLE labels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT
);

CREATE UNIQUE INDEX labels_name_unique ON labels (name);
