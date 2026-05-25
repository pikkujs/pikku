---
name: pikku-template-clone
description: 'Standard cleanup to run right after a Pikku template is cloned or scaffolded into a new project. TRIGGER when: a Pikku template was just cloned/scaffolded (via `pikku create`, `git clone <template>`, or the user says "I cloned the kanban template / starter / template"), or the working tree still looks like an untouched template (template README, placeholder `@project/*` name in package.json). DO NOT TRIGGER when: working in an established project mid-feature, or editing the template repo itself.'
allowed-tools: Bash(git status *), Bash(git add *), Bash(git commit *), Bash(git rm *), Bash(git mv *), Bash(git log *)
---

# Pikku Template Post-Clone Cleanup

## Agent Operating Procedure

Run this **once**, right after a template is cloned or scaffolded into a new
project. The goal is to turn template scaffolding into a real project. Make the
smallest changes and land them as one focused `chore: post-clone cleanup`
commit, separate from any feature work.

1. **Replace the template README.** The shipped `README.md` describes the
   *template*, not the user's project — leaving it in place is misleading.
   Either delete it (`git rm README.md`) or rewrite it with the new project's
   name and purpose. Never ship a clone with the generic template README.
2. **Keep the lockfile committed.** Templates ship a committed `yarn.lock`; do
   NOT re-add `yarn.lock` to `.gitignore`. A real project commits its lockfile
   for reproducible installs. The correct pattern is `yarn.lock` followed by
   `!/yarn.lock`, which commits the root lockfile while keeping generated
   per-unit lockfiles under `.deploy/` (and `e2e/`) ignored.
3. **Rename template identifiers.** Update `name` in the root `package.json`
   (and any `@project/*` or other placeholder names) to the real project.
4. **Drop template-only artifacts.** Remove any `TEMPLATE.md`, demo docs, or
   placeholder content that only made sense for the template.

Do not touch generated files (`.pikku/`, `*.gen.*`) or run a full reinstall as
part of cleanup — this step is project hygiene, not a build.

## Why this exists

Templates are structure-only starting points. Without this pass, clones carry a
misleading README, a placeholder package name, and (historically) a gitignored
lockfile — all of which leak template assumptions into a real project. Running
it immediately after clone keeps every Pikku project, OSS or Fabric, starting
from a clean, honest baseline.
