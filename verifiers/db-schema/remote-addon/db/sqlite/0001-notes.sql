CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL
);

CREATE UNIQUE INDEX notes_body_unique ON notes (body);
