---
type: overview
title: Decisions
description: Rules chosen in the SQL migration applier, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->

- [A dotfile in the migrations directory is never a migration](a-dotfile-is-never-a-migration.md) — migrationFiles keeps names ending in .sql that do not start with a dot, so the AppleDouble ._ files a macOS tarball carries are not applied, listed as pending, or baselined

<!-- /pikku:knowledge-index -->
