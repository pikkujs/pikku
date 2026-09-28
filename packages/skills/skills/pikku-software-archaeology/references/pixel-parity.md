# Pixel parity

You are rebuilding an application that already exists, and someone is going to ask whether the new
screens look like the old ones. "Yes" is not an answer anybody can check. This is how you turn it
into evidence: shoot both sides, measure them, and publish one page that puts them side by side with
the differences named.

Run it when the archaeology has produced a rebuild worth comparing — after `frontend-routes.json`
and `frontend-components.json` exist, because those are what tell you which screens there are.

The output is a **contact sheet**: one section per screen, per viewport, with the live capture, the
rebuild capture, a precomputed difference map, the anchor measurements behind the grade, and the
differences that remain with their causes. `references/contact-sheet.schema.json` is the contract;
`scripts/contact-sheet.mjs` builds it; publish the result as an artifact.

---

## The order

1. **Enumerate the screens.** From `frontend-routes.json` if the archaeology produced one, otherwise
   by crawling: sign in, walk every `<a href>` that stays on the origin, and record the routes. Then
   walk them again looking for what a route does not reach — dialogs, menus, row actions, empty
   states, error states. Those are screens too and they are where a rebuild diverges most, because
   nobody screenshots them.
2. **Ask for the viewports.** See below. The user picks; you do not assume.
3. **Ask for credentials.** Once, at the start, securely. See below.
4. **Shoot side A** (`crawl.mjs --side a`), the incumbent.
5. **Shoot side B**, the rebuild.
6. **Measure** (`measure.mjs --manifest`), which writes the difference maps and the scores.
7. **Write the sheet JSON** — the grades, notes, anchors and gaps are yours, not the script's.
8. **Build and publish** (`contact-sheet.mjs`), then read the page. If it makes you want to argue
   with it, it is working.

---

## Credentials

**Ask once, at the start, and never write them down.**

- Read from the environment first (`A_USER`, `A_PASS`, `A_TOKEN`), so a `set -a && . ./.env` shell
  or CI already has them. Otherwise prompt on the TTY with echo suppressed.
- Never put a credential in the shoot config, a filename, a log line, the manifest, a commit, or a
  screenshot. A password pasted into a JSON file is in the shell history, in the editor's undo
  buffer, and one `git add .` from being permanent.
- Never pass one on the command line: it lands in history and in `ps`.
- Where the target has a persona or actor system, prefer a **derived** secret over a real password —
  an HMAC of a shared scenario secret over the account's email, posted to the actor sign-in
  endpoint. Nothing durable leaves the machine and the shoot cannot touch a real user.
- Post the sign-in **from inside the page**, so the cookie the app actually uses is the one that
  gets set. A header this script invents is not carried by any later navigation.
- Say out loud, to the user, which host you are signing into. Credentials for a staging host are
  for that host; do not reuse them anywhere else, and do not let them reach a subagent's prompt.

## Viewports

**The user picks the widths, and there is more than one.** A sheet shot at 1440 is a claim about
1440. A rebuild that matches on desktop and collapses at 390 has not matched, and the way that
divergence gets found is by capturing it, not by remembering to check later.

Offer a desktop width and a phone width as defaults (1440 and 390 are reasonable), take whatever the
user says, and write it into the shoot config as `viewports`. Then every screen carries a `captures`
map keyed by viewport id, and each viewport gets its own panes, its own delta chip and **its own
anchors** — the landmark that pins a desktop layout, a sidebar's left edge, does not exist at 390.

Three things about mobile in particular:

- **Turn on touch emulation** (`isMobile`, `hasTouch`). A phone-width capture with it off silently
  renders the desktop navigation on any layout that keys off pointer type rather than width, and you
  will compare two desktop screens while believing you are comparing two phones.
- **Mobile captures run two to three times taller** than the same screen on desktop. That is where
  the height cap and the byte budget bite first.
- **Every viewport roughly multiplies the page weight.** If two viewports will not fit under the
  cap, publish one sheet per viewport rather than degrading the images — below about 620px wide a
  pane stops being evidence of anything.

Grade a screen by its **worst** viewport, and say in the note which one that was.

---

## Traps

These all cost real time on real migrations. They are in rough order of how much.

### The overlay trap

**Do not compute the difference in the browser.** `mix-blend-mode: difference` over an inverted pane
computes `|A + B - 255|`, not `|A - B|`. Agreement comes out white on white *and* white on black,
every mid-tone glows, and two visually identical screens produce a blurry overlay. Someone will look
at it and ask why the rebuild is broken; the honest answer is that the overlay is lying. Precompute
the map with `measure.mjs`.

### The resample trap

Even a correct difference computed on downscaled images is wrong. Capture at 1600, store at 1200,
JPEG it, and let the browser lay it out at 1100: three resamples, each smearing a one-pixel
disagreement across about three. Every edge glows. **Compute at capture resolution and downscale the
result.**

### The defaults trap

The answer to "why do screens I marked matched still differ everywhere" is almost never the pages.
It is a handful of component-library defaults that repeat thousands of times per page, and per-page
compensation cannot converge — a padding nudge fixes one screen, leaves the error on the other
eighty, and buries the evidence. Real ones, all fixed centrally in the theme:

- `lineHeights.md` defaulting to 1.55 where legacy was 1.5. Every 14px run came out 21.7px against
  21px, on roughly 120 elements per page.
- Table spacing defaults (`verticalSpacing: 'sm'`, `horizontalSpacing: 'md'` = 8/16px) against
  legacy's 0px 12px and 8px 12px. And legacy rules the **cell** where the component library rules
  the **row**: set the cell border without zeroing the row and you get a doubled rule.
- A modal overlay at 60% black against legacy's 32%. Three screens came out 68–79% different and
  anchor measurement found nothing, because every anchor *was* in the right place — the whole page
  was just darker. Found by sampling background pixels: live composited white to 173, the rebuild
  to 102.

When a difference appears on many screens at once, stop fixing screens and go find the default.

### The font ladder trap

No stylesheet can reach this one. Legacy may ship exactly **one** face — `@font-face` family
`Roboto`, `Roboto-Regular.ttf`, `font-weight: normal` — and put its other weights in separate
*families*, each also declared normal. On that site `font-weight: 300` and `500` both render Regular
and only 600+ gets synthetic bold. If the rebuild fetches the full weight ladder from Google Fonts,
every glyph advance differs, every line of text is subtly off, and the CSS is already correct: it is
a font-*fetch* decision. Diagnose with `canvas.measureText` on one string at several weights — live
gave 197.8px at 300/400/500/700 (identical, which is the tell), the rebuild 194.9 / 197.93 / 199.4 /
200.63. Fix it in the theme spec that drives the font href, not in a stylesheet.

### The provenance trap

A pair of screenshots is only evidence if both halves record where they came from. A stale shot
under a right-looking filename is the one failure a contact sheet structurally cannot show you: it
looks like a pass. Every capture appends id, viewport, side, route, **the URL the browser actually
landed on**, file and ISO timestamp to `manifest.tsv`, and a check refuses to build when a pane's
recorded URL contradicts its declared route or a rebuild pane is older than the newest source
change. That check catches the re-shoot that silently never ran, which otherwise costs an hour of
reading the previous evening's log.

### The redirect trap

Crawling signed in captures the dashboard for `/`, `/login` and `/register`, because they all
redirect there. Three routes come back byte-identical and nobody notices until someone opens the
artifact. Run a **second, signed-out pass** for the public set — and treat identical file sizes
across unrelated routes as the alarm it is.

### The entitlement trap

The account you crawl as shifts every coordinate on every page. One shoot ran as a user with no
licence, so a banner sat above the content and every y-coordinate on the live side was 44px low
against a rebuild shot as a licensed user. Record who each side was captured as, in the colophon,
and use accounts in the same state.

### The scoring trap

Score on the **original** captures, with a per-channel threshold (40/255 works) and both panes
cropped to their **common box**. Without the threshold you are measuring JPEG noise. Without the
crop, a height delta scores as near-total difference — and your pagination finding arrives as a
number nobody can act on instead of as an insight.

### Height deltas are a pagination finding

A big page-height delta is not a rendering artifact. Academy 3,365 → 24,959px, downloads 900 →
13,427px: the rebuild was rendering whole collections where the incumbent paginated. That is a
product divergence, it belongs in `gaps` with that word on it, and no amount of CSS will close it.

### The id trap

Legacy ids never map to rebuild ids. Pair at **screen-type** level (`product detail`), and scrape
the rebuild's own slug off its index page rather than assuming the number carries over. Where an
index renders its links as buttons rather than anchors, a link crawl returns nothing — fall back to
a known fixture slug and say so.

### The decompression-bomb trap

A 1440 × 24,959 full-page capture is 340 million pixels and PIL refuses to open it
(`DecompressionBombError`). Set `Image.MAX_IMAGE_PIXELS = None`, or use ImageMagick, which does not
care.

### The budget trap

The published artifact must come in under 16MB rendered, and base64 costs a third on top of every
image. Images must be inlined as data URIs — the artifact CSP blocks images from every external
host, so there is no other option. Working settings for ~250 images at 14.98MB: screens downscaled
to 1200px wide at JPEG q72; difference maps quantised to a 16-colour adaptive-palette PNG, cropped
to 3000px tall. If you go over, the lever with the least visible cost is the diff map's **levels**,
then JPEG quality; **image width is the last thing to touch**, because it destroys the thing the
page exists to show. Do not try to add a third pane to an existing register that is already near the
cap — publish a second artifact and say so.

### Capture timing

You will only discover this when you parallelise. A blind three-second sleep after navigation, then
one synchronous look at each opener, works with a single browser and produces 25 "no opener matched"
failures with four workers on one dev server — failures that look exactly like missing components.
Wait for the **screen**: loader detached, then network idle, then a short settle. Make openers poll
a union selector instead of deciding on one look. And remote background images decode *after* the
loader disappears, so a swatch grid shot too early comes back with white tiles where live has
photographs, which reads as a styling bug for as long as you let it.

### Cold compile at login

Restart the dev server before a shoot and the first request compiles the login route, outrunning
Playwright's 30s default. The fill times out, the shooter dies at sign-in, and every later capture
fails unauthenticated with an error that says nothing about login. Fire one warm-up request before
any worker signs in.

### Controls hidden by visibility

A row kebab held at `visibility: hidden` until its row is hovered can never be reached by
`locator.click`, which refuses an invisible target. Read `getBoundingClientRect` inside `evaluate`
and drive `mouse.move`/`mouse.click` to the centre. Both shooters need this, for the same reason.

### Sharding shape

Stride the screen list **round-robin**, not in contiguous blocks. The slow captures cluster together
— a ledger's sort, view and row-menu variants sit next to each other — so a block split hands one
worker all of them and you get no speedup at all. Round-robin took a full shoot from ~20 minutes to
~4.5 on four workers. Keep the phases serial (static pass, then dialog pass): the shared dev server
is the bottleneck, not the browsers.

### Port from the source, not from the screenshot

A screenshot shows one width. The incumbent's stylesheets show all of them — the breakpoints, the
container ladder, the type scale, the `rem` base. Read those and port the system; then the parity
holds at widths you never captured.

### Specificity and inline props

`.chrome h1` is specificity (0,1,1) and outranks any single-class rule, so a `:is()` wrapper does not
help and `:where()` does — it zeroes the element part. And component-library inline props (`fz=`,
`fw=`) become inline styles that no stylesheet can beat; those have to move into the theme.

### Parity work versus the test suite

Rewriting markup for parity breaks every scenario asserting on a test-id or on copy. The rule that
holds: **parity work may change CSS and component props freely, but may not change test-ids or
user-visible strings.** Where a legacy string genuinely differs, the string *is* the finding — it
goes in the screen's `gaps`, not silently into the markup. That kept one browser suite green through
a change touching 45 stylesheets. Re-run the suite after each milestone regardless.

### Parallel agents

Partition by page-scoped CSS file, guard any shared message-key file with a lock, and use a
non-incremental typecheck (`tsc --noEmit --incremental false`) — a shared incremental cache corrupts
under concurrent writers. The real clash risk is not the files, it is **class-name collisions**
across agents working on different pages.

---

## Writing the sheet

The scripts produce captures, maps and scores. The **grades, notes, anchors and gaps are yours**,
and they are the reason the page is worth keeping.

- A note that says "matches" is worth nothing. A note that says "tile pitch 232px against live's
  232, card inner padding was 16 and is now 12px 16px, the type ladder is the theme's not the
  page's" is worth the whole exercise.
- Anchors make "Match" checkable rather than asserted. Pick landmarks that pin the layout: a
  wordmark's ink box, a grid's pitch on both axes, the first row's baseline, a column's left edge.
- A `gap` names a difference **and its cause**. A difference caused by data (two accounts, two
  tenants, two catalogues) is not a styling defect and must say so. A difference caused by a missing
  feature is a gap and belongs in the backlog.
- Do not leave a screen off the sheet because it is embarrassing. A reader must be able to tell a
  screen that matched from a screen nobody looked at — that is what the `open` status and the
  colophon's "what is not here" sentence are for.
