CREATE TABLE labels (
  id VARCHAR(255) PRIMARY KEY NOT NULL,
  name VARCHAR(255) NOT NULL,
  color TEXT
);

CREATE UNIQUE INDEX labels_name_unique ON labels (name);
