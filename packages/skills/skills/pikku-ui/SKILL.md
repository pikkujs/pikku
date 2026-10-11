---
name: pikku-ui
description: >-
  How a screen gets made: it is delegated to a subagent, which is handed the project's design rules and designs it with the impeccable skill.
  TRIGGER when: the user asks for a screen, page, view, form, dashboard or empty/error state, or asks for an existing screen to be redone or restyled.
  DO NOT TRIGGER when: the change is backend only, copy only (use pikku-i18n), or a one-line fix to a screen that already looks right.
installGroups: [client]
---

# Screens go to a subagent

A screen the main thread draws by hand comes out generic and gets rejected. Every request for
a screen is handed to a subagent that is told the rules and designs with `impeccable`.

## Steps

1. Find the design rules for this project: `DESIGN.md` and the UI section of `AGENTS.md` at the
   repo root, and the shared component package the screens are built from. If a project has
   none, say so and stop. Do not invent a look.
2. Start one subagent per screen. Its prompt must contain:
   - the screen and its route or file, and the content it has to show or do;
   - an instruction to read `DESIGN.md` in full and the UI section of `AGENTS.md` before drawing;
   - an instruction to build only from the shared components, and to copy the closest existing screen;
   - an instruction to invoke the `impeccable` skill and run its design workflow before writing code,
     with the output landing in the existing theme tokens and variants, never new styles;
   - who the audience is, and that jargon is a defect;
   - the checks to run (typecheck), and how to commit (path-scoped, never sweep other work in).
3. A redesign refines what is there. The subagent keeps the hero, imagery, illustrations, copy tone
   and composition unless the user named one of them as the problem. Fewer controls and more feeling is
   the direction; never trade a hero or images for forms, toggles and buttons. The prompt must list what
   must not change and quote the user's actual complaint. A result with less visual character than the
   original is a failure. If it is not clear what is wrong, ask the user before starting.
4. Do not draw or restyle the screen in the main thread, even for a small screen.
5. When the subagent reports, look at the screen before telling the user it is done (one render or DOM
   check). Check that it did what it was told. If it only loaded `impeccable`
   and skipped its workflow, send it back. Tell the user what changed and what it decided.

## What stays in the main thread

Wiring: routes, data hooks, state, redirects, and what a screen should contain. The subagent owns
how it looks.
