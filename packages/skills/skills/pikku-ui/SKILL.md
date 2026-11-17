---
name: pikku-ui
description: >-
  How a screen gets made: delegate to a subagent with the project's design rules and the impeccable skill. For any screen, page, form, dashboard, empty/error state or redo. Not backend or copy-only changes.
installGroups: [client]
---

# How a screen gets made

A screen drawn without the project's design rules comes out generic and gets rejected. Whoever draws it (you, or a subagent if you have the tool) works from the rules below.

## Steps

1. Find the design rules for this project: `DESIGN.md` and the UI section of `AGENTS.md` at the
   repo root, and the shared component package the screens are built from. If a project has
   none, work from the closest existing screen and, for a rebuild of a live site, the reference screenshots. Do not stop, and do not invent a look.
2. Build the screen yourself, in the checkout you were given, under these rules. If you have a tool named `subagent` you may hand a screen to a
   subagent instead; if you do not, never stop or ask: build it. Either way the work follows these rules:
   - the screen and its route or file, and the content it has to show or do;
   - an instruction to read `DESIGN.md` in full and the UI section of `AGENTS.md` before drawing;
   - an instruction to build only from the shared components, and to copy the closest existing screen;
   - an instruction to use only the existing theme tokens and variants, never new styles (and, when an `impeccable`
     skill is installed, to run its design workflow before writing code);
   - who the audience is, and that jargon is a defect;
   - the checks to run (typecheck), and how to commit (path-scoped, never sweep other work in).
3. A redesign refines what is there. The subagent keeps the hero, imagery, illustrations, copy tone
   and composition unless the user named one of them as the problem. Fewer controls and more feeling is
   the direction; never trade a hero or images for forms, toggles and buttons. The prompt must list what
   must not change and quote the user's actual complaint. A result with less visual character than the
   original is a failure. If it is not clear what is wrong, ask the user before starting.
4. Do not invent a look: stay inside the shared components and the existing theme.
5. When the subagent reports, look at the screen before telling the user it is done (one render or DOM
   check; `pikku ui pages list` names the route and `pikku ui pages screenshot --base-url <url>` photographs it). Check that it did what it was told. If it only loaded `impeccable`
   and skipped its workflow, send it back. Tell the user what changed and what it decided.

## What stays in the main thread

Wiring: routes, data hooks, state, redirects, and what a screen should contain. The subagent owns
how it looks.
