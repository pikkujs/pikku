---
type: decision
title: definePlugin fails the build on a duplicate path, a title missing from en.json, a badge naming no function, or agents/skills the package would not publish
description: validatePikkuStudio reports PKU357 for a path used twice, PKU358 for a title key missing from messages/en.json and PKU359 for a nav badge that names no function of the addon; a key missing from another locale is only a warning
tags: [inspector, screens, studio, addon]
---

# definePlugin fails the build on a duplicate path, a title missing from en.json, a badge naming no function, or agents/skills the package would not publish

`definePlugin` replaces `defineScreens` outright: there is no alias, and the
inspector only recognises a call to `definePlugin`.

- A path used by two screens of the same addon is
  `STUDIO_SCREEN_PATH_DUPLICATE` (PKU357), reported by `addPikkuStudio`
  (`packages/inspector/src/add/add-pikku-studio.ts:289`).
- `validatePikkuStudio` (run from `inspector.ts:215`, after every file is
  visited) finds the addon's package root as the nearest `package.json` above
  the file that calls `definePlugin` (`packageRoot`, line 305). A manifest or
  screen title missing from `messages/en.json` there is
  `STUDIO_MESSAGE_KEY_MISSING` (PKU358, line 404); missing from any other
  `messages/{locale}.json` it is a warning (line 495).
- A `nav.badge` that names no function in `state.functions.meta` is
  `STUDIO_BADGE_FUNCTION_NOT_FOUND` (PKU359, line 474).
- A screen's `agent` of the form `studio:<name>` names an agent Studio ships;
  only its format (`/^studio:[a-z][a-z0-9-]*$/`) is checked, with no file lookup
  and no `agentTitle`/`agentDescription`.
- Any other `agent` is checked in the same pass: a name outside
  `/^[a-z][a-z0-9-]*$/`, a missing or blank `agents/<name>.md`, or a file
  without frontmatter `title` and `description` is
  `STUDIO_SCREEN_AGENT_INVALID` (PKU365). Those two frontmatter values are
  message keys, so one missing from `messages/en.json` is PKU358, and one
  missing from another locale is the same warning a screen title gets: the
  locale pass runs after the agent pass, over every key both passes collected.
  A valid agent gets `agentTitle` and `agentDescription` written onto its
  screen in `state.studio`, so Studio reads them from the generated meta.
- `agent: ''` is kept on the screen, not dropped as if absent, so it fails as
  PKU365 rather than leaving the screen without an agent. Both inspectors must
  agree on this; the Go reader tracks whether `agent` was written, not whether
  it is non-empty.
- `agents/` and `skills/` are read from the published package, so a `files`
  list in the addon's `package.json` that leaves them out is
  `STUDIO_PACKAGE_FILES_MISSING` (PKU366): once per screen whose `agent` is not
  `studio:<name>` and drew no PKU365 when `agents/` is missing, and once when
  the package has a `skills/<name>/SKILL.md` and `skills/` is missing. An
  invalid agent gets PKU365 alone: there is nothing to publish until it is
  fixed, and a second error would only repeat the first. A PKU358 on its
  frontmatter keys does not suppress PKU366, since the file exists. An entry counts when it is the folder name, with or
  without a trailing slash, or any pattern starting with `<folder>/`; no
  negation or `./` handling. No `files` field means npm publishes everything,
  so there is nothing to check. `pikku new addon <name> --ui` scaffolds
  `files: ['dist', 'messages', 'agents', 'skills']` (see the CLI's
  `the-ui-addon-scaffold-writes-the-studio-block-and-ships-agents-and-skills`).
- The diagnostic order is part of parity: PKU358 for screen and addon
  titles, then per screen the agent checks (PKU365, PKU358 for frontmatter
  keys, PKU366) and the badge check (PKU359), then the skills PKU366, then the
  other-locale warnings.

The Go inspector runs the same check (`ValidatePikkuStudio` in
`internal/visit/group_pikku_studio.go`, called from `internal/analyze/analyze.go`).
`verifiers/pikku-studio` builds a valid addon and then breaks it once per code
(PKU345, PKU357, PKU358, PKU359, PKU365, PKU366).

**What this rules out:** shipping an addon whose screen titles Studio cannot
translate, whose badge calls nothing, or whose two screens claim one route.
