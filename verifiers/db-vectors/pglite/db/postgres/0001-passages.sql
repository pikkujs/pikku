-- pgvector, which PGlite loads by default. Without it `create extension`
-- fails with "extension vector is not available".
create extension if not exists vector;

create table passage (
  id serial primary key,
  body text not null,
  embedding vector(3) not null
);
