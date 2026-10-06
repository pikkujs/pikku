---
name: pikku-convert-screen
description: Use when an old screen, page or feature (from an old console, another repo, screenshots, or a description) has to be rebuilt in the current app. Extracts what it does as plain business logic, with no layout or code detail, then designs it fresh in the current design system. TRIGGER on "convert this screen", "port the old console page", "we had this before, bring it back", "redesign X from the old console". DO NOT TRIGGER for whole-repo reverse engineering (use pikku-software-archaeology) or for restyling a screen that already exists in the app.
installGroups: [core]
---

# Convert a screen

Keep what the screen does. Drop how it looked and how it was built.

## 1. Read the old thing

Use whatever is given: a path, a repo, screenshots, a recording, a description. For code, read the page, its hooks, the RPCs or endpoints behind it and any tests. For images, read the labels and states, not the styling. Check whether the app already has it under another name before starting.

## 2. Write the spec

Save it as `docs/screens/<name>.md`. Business logic only.

- Who uses it and what they are trying to get done.
- What they can see, in the words a non-technical owner would use.
- Every action: what triggers it, what must be true first, what changes, what the person is told afterwards.
- Rules and limits: who may do it, what is refused and why.
- States: empty, loading, working, done, failed. For each failure, what the person can do next.
- Data it needs and which existing RPCs provide it. Mark any that are missing.
- Things you were unsure of, marked as open questions. Never present a guess as fact.

Leave out: component names, layout, colours, spacing, library names, file structure, modals versus drawers, table versus cards. If a sentence only makes sense by picturing the old UI, rewrite it.

Stop and show the spec. Do not design until it is agreed.

## 3. Build it in the current design system

Design from the spec, not from the old screen. Never copy old markup or styles.

- Read the project design system (`DESIGN.md`, theme tokens) and the nearest existing screens first. Match their header, spacing, buttons and wording.
- Use the components the project already uses. No modal dialogs: forms go in the side panel or a new page.
- Plain words. The client's own vocabulary, never internal jargon.
- Every error says what happened in plain terms and offers a way out, with an AI fix where it makes sense.
- No static data. The screen reads through RPC hooks only. Fake data for a prototype lives in its mock RPC layer, with a populated and an empty scenario.
- The same component serves the real app and any prototype.
- Add the route and a rail entry only where the spec says people reach it.

## 4. Check against the spec

Walk the spec line by line against the running screen, including the empty and failed states. Say which lines are met, which are not, and which depend on RPCs that do not exist yet. Capture a screenshot from the running screen.
