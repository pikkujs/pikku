---
name: pikku-artifacts
description: >-
  Drawing screens before they are built, as files under artifacts/: an ADDITION (a new screen in the
  app's own look, as .tsx using the app's real components, with options to pick between), an
  EXPLORATION (very different design directions for a whole app, then the picked one grown screen
  by screen), or a PRESENTATION (a deck made of the app's components). Covers the file contract the
  design view reads, the preview contract, picking, versioning and hand-over to the build.
  TRIGGER when: after the kickoff interview of a new project; the person wants to see screens,
  options or directions before building; wants a redesign; wants slides or a walkthrough; or a
  change names an artifact. DO NOT TRIGGER when: building the real screens (pikku-build) or theming
  the built app (pikku-theme).
installGroups: [client]
---

# Artifacts

An artifact is a picture of screens, drawn before they are built, so "no, not like
that" costs a redraw instead of a rebuild. It is a self-contained HTML page in the
project's `artifacts/` folder. The design view lists that folder live: write a file and
it appears. The person discusses it, you redraw it, they pick, the build turns the pick
into the app.

To the person it is "a picture of the screens". Never "mock", "mockup" or "wireframe".
Say on the page and in your message that nothing is built yet.

## Which kind

| The person wants | Kind | Read |
| --- | --- | --- |
| A new screen, feature or change in an app that already has its look | Addition | `references/addition.md` |
| A look for a new project, after the kickoff interview | Exploration | `references/explore.md` |
| A redesign of an existing app, free of its current look | Exploration | `references/explore.md` |
| The next screens of a direction already picked | Exploration, continued | `references/explore.md` §6 |
| A deck: a pitch, a feature walkthrough, what changed | Presentation | `references/presentation.md` |
| Something off the wall: a canvas or 3D direction | Exploration, wild | `references/wild.md` |

When unsure: if the app has a theme they are happy with, it is an addition.

## The folder contract

```
artifacts/<slug>-vN.tsx                  addition or presentation, real components
artifacts/<slug>-vN.html                 addition or presentation, when there are none
artifacts/explore/<name>-vN/
  brief.md                               who, feeling, references, scope
  routes.md                              one line per screen, real or imagined
  screens/<route-slug>.md                each screen by behaviour only
  directions/<id>.html                   competing looks, the same first screens
  directions/assets/<id>.(py|glb|png)    a wild 3D direction's Blender script and model
  tokens.md  decisions.md  gaps.md       written once a direction is picked
  pages/NN-<route-slug>.html             the screens, added group by group
```

- Slugs are lowercase letters, digits and dashes. `-vN` is a revision, never an
  alternative. Alternatives live inside one version.
- **Never overwrite a version the person has seen.** Change it by writing `-v(N+1)`:
  a copy of the file or folder, then your edits.
- The title is what the design view lists, so make it the screen's or set's name in the
  person's words: `<title>` in HTML, `export const title = '…'` in TSX.

## Every page

- **TSX when the app has components, HTML otherwise.** An addition or presentation in
  an app with `src/components/ui` is a `.tsx` file built from those real components, so
  what the person approves is literally what ships. An exploration is always HTML: its
  point is a look the current components and theme do not have yet.
- **A TSX artifact** default-exports a component with no props. The design view
  compiles it with the app's Tailwind and theme.
  - Import the app's components relatively, from the artifact's own location:
    `import { Button } from '../apps/app/src/components/ui/button'`.
  - Only components that render from their props. Nothing that needs a signed-in
    person, a session, data fetching (`usePikkuQuery`, an RPC or API client), the router,
    or a provider the app sets up at its root. Pages and route components almost always
    do: draw the screen from the pieces they use instead.
  - The data is literals in the file: realistic records from their domain.
  - Layout is your own Tailwind classes; controls are the imported components.
- **An HTML artifact** is one standalone file. No build step, no imports from the app, no
  relative links outside its own folder. Load Tailwind in the page:

  ```html
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
  <style type="text/tailwindcss">
    @custom-variant dark (&:where(.dark, .dark *));
    @theme inline {
      --color-background: var(--background);
      --color-foreground: var(--foreground);
      --color-card: var(--card);
      --color-card-foreground: var(--card-foreground);
      --color-primary: var(--primary);
      --color-primary-foreground: var(--primary-foreground);
      --color-secondary: var(--secondary);
      --color-secondary-foreground: var(--secondary-foreground);
      --color-muted: var(--muted);
      --color-muted-foreground: var(--muted-foreground);
      --color-accent: var(--accent);
      --color-accent-foreground: var(--accent-foreground);
      --color-destructive: var(--destructive);
      --color-border: var(--border);
      --color-input: var(--input);
      --color-ring: var(--ring);
      --radius-sm: calc(var(--radius) - 4px);
      --radius-md: calc(var(--radius) - 2px);
      --radius-lg: var(--radius);
      --radius-xl: calc(var(--radius) + 4px);
    }
  </style>
  ```

  Without that `@theme inline` block, `bg-primary` and every other token class
  silently render nothing. Copy it whole.

- Colours, radius and fonts are the shadcn token names (`--background`, `--foreground`,
  `--primary`, `--muted`, `--border`, `--radius`, …), used through classes like
  `bg-background text-foreground border-border`. An addition gets the app's values
  injected by the design view. An exploration declares its own in `:root` and `.dark`.
  Either way the names are the app's, so what is picked maps one to one onto
  `themes/<name>.json`.
- **Page shape is free, controls are shadcn's.** Regions, columns, rhythm and what
  overlaps what are yours. Anything a person would point at and call a control
  (buttons, inputs, selects, tables, badges, menus, sheets) is the real component in
  TSX. In HTML it is drawn at the metrics the shadcn components use, such as `h-9`
  controls and their padding and radius. A control the build cannot produce is a
  promise the app will break.
- Real content from their domain, never lorem. Their language.
- **Do not draw a preview bar.** The design view owns screen size, light/dark and
  state, and drives the page from outside:
  - dark mode is the `dark` class on `<html>`;
  - the state is `data-artifact-state="<state>"` on `<html>`. Mark each variant with
    `data-artifact-when="<state>"`, and the view shows only the matching ones. Draw
    `ready` always, plus `empty` and `problem` wherever the screen has them. List the
    states the page supports in `data-artifact-states="ready empty problem"`: on the
    `<html>` tag in HTML (not `<body>`), on the root element in TSX.
- No dialogs. A form opens in a side panel or on its own page.
- Prefix every class, id and `data-` attribute you invent with `x-` so nothing you add
  collides with what the design view injects.

## Picking and discussing

- An **option** is a section marked `data-artifact-option="<name>"`. The design view
  lists the options, and the person can refine one or adopt it. A refine reaches you as
  the artifact, the option and their words: write the next version.
- A **direction** is a file in `directions/`. Picking one reaches you as the folder and
  the direction's id: §5 of `references/explore.md` says what to write.
- What the person says about a picture, write into the next version and into
  `decisions.md` (exploration) or the change (addition). A picture is cheap. Their
  reasons are what is worth keeping.

## Handing over to the build

The build never reinterprets a picture. It transcribes the picked one.

- **Addition**: the change names `artifacts/<slug>-vN.html` and the adopted option. The
  build reads that section and builds it with the app's components.
- **Exploration**: first `tokens.md` becomes the app's theme
  (`themes/<name>.json`, then `pikku theme apply`; see pikku-theme). Then each
  approved page in `pages/` becomes a change naming the page. One page per change, in
  the page order.
- A screen the build turns out to need that no picture has means the picture was
  wrong: draw it as an addition, then build it. When a picture and the knowledge files
  disagree about a fact, knowledge wins. When they disagree about a layout, the
  picture wins.

## Stop at viewable

Write the page, open it once to check it renders, tell the person where it is and what
to look at, then stop. Critique and polish only when asked.
