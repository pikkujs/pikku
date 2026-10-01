CREATE TABLE notes (
  id VARCHAR(255) PRIMARY KEY NOT NULL,
  body VARCHAR(255) NOT NULL
);

CREATE UNIQUE INDEX notes_body_unique ON notes (body);
