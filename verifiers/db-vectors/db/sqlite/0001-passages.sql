-- A table and the sqlite-vec index beside it. `vec0` is the module
-- `db.sqliteExtensions` loads by default, so this migration fails wherever
-- that extension did not reach the database.
create table passage (
  id integer primary key,
  body text not null
);

create virtual table passage_vector using vec0(embedding float[3]);
