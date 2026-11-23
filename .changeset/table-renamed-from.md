---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku db generate` renames a table the way it renames a column. Declare the table under its new name with `renamedFrom: 'old_name'` and `generate` writes the engine's table rename instead of a create and an approved drop, so the rows stay. The indexes, keys and `onUpdate` triggers the engine names after the table are renamed with it, and a foreign key in another table follows the new name. It refuses, naming the table, when the migrations hold neither the old table nor the new one, when they hold both, on a `declareOnly` table, and when two tables are renamed from one name.
