---
'@pikku/skills': patch
---

Tighten every skill description (about 24% fewer characters, same TRIGGER and DO NOT TRIGGER conditions) so less sits in context on every task, and correct the runtime package names in `pikku-concepts` (`@pikku/express`, `@pikku/fastify`, `@pikku/lambda`, `@pikku/uws`, not the directory names).

Remove the deleted Console from the skills (no console links, deep-link tables or console-inspection steps; progress is reported in plain words with the app and API links `bun run dev` prints), and split `pikku-concepts` so its look-up material (CLI commands, functions, schemas, testing) lives in references and `SKILL.md` drops from about 23 KB to 9 KB.
