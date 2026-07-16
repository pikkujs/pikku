---
'@pikku/cli': patch
---

Fix skill frontmatter so every bundled skill actually loads.

46 of the 61 bundled skills were silently dropped by pi.dev. Their descriptions were written as multi-line single-quoted YAML scalars with `TRIGGER when:` continuations starting at column 0. Per spec a single-quoted scalar's continuation lines must be indented past the key, so at column 0 the scalar terminates and the parser reports an unclosed quote.

Parsers disagree on this: js-yaml (which Claude Code embeds) accepts it, while the `yaml` package rejects it. pi.dev parses SKILL.md frontmatter with `yaml`, and `loadSkillFromFile` catches the parse error, records a *warning* diagnostic and returns `skill: null` — so the skill never loads and nothing fails loudly. Only 15 of 61 skills were reaching pi.

All 46 affected descriptions are now `>-` folded block scalars. Each rewrite was verified to reproduce its previously-parsed description byte-for-byte, so routing behaviour is unchanged; `installGroups` and every other field are untouched. A pi-faithful simulation of its loader now reports 61/61 loaded, 0 dropped, 0 warnings.

The corpus lint now parses frontmatter with the same `yaml` package (already a direct dependency) rather than regex, so a skill that pi would drop fails CI instead of shipping invisibly. It also enforces pi's 1024-character description limit.
