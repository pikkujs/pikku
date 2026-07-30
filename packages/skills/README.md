# @pikku/skills

The Pikku agent skills — the instruction set coding agents read to build, wire and
deploy Pikku projects. **MIT licensed**, deliberately: the format and the skills are
the open core, so any harness can adopt them without taking on the Pikku CLI's
Business Source License.

Each directory under `skills/` is one skill: a `SKILL.md` with YAML frontmatter
(`name`, `description`, optional `installGroups`) plus any `references/` it needs.
The frontmatter shape is the one Claude Code, opencode and pi.dev all parse.

## Installing them

You do not normally depend on this package directly — the CLI installs from it:

```bash
npx pikku skills install                  # → .claude/skills/
npx pikku skills install --core --fabric  # the Fabric sandbox skill set
npx pikku skills install --agent pi       # → .pi/skills/
```

## Reading them programmatically

```ts
import { listSkillNames, listSkillFiles, readSkillFile } from '@pikku/skills'

for (const name of await listSkillNames()) {
  for (const path of await listSkillFiles(name)) {
    console.log(path, (await readSkillFile(path))?.length)
  }
}
```

Reads prefer the `skills/` directory on disk, so editing a `SKILL.md` is live
immediately. `SKILL_FILES` is the same content as an embedded path → contents map,
which is what makes the skills available inside the `bun --compile` CLI binaries
where no filesystem copy exists. Regenerate it with `yarn embed` after changing
anything under `skills/`.
