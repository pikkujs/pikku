# Exploration: completely different directions, then one grown into every screen

Use it for a new project after the kickoff interview, and for redesigning an existing
app so that its current look has no influence. The method: list every screen, describe
each by behaviour only, have designers who have seen none of your framing propose very
different looks, let the person pick one, then add the screens group by group.

Everything goes in `artifacts/explore/<name>-v1/`.

## 1. Frame it: `brief.md`

- Who it is for, in the person's words, and what the product is. If they pasted a
  brief, keep it verbatim.
- The feeling they want ("comfortable and polished", "calm, like a paper notebook").
- The products they point at as references: "like Linear, but warm like Spotify". Ask
  for these if the interview did not get them. They steer far better than adjectives
  like "modern" or "award winning".
- The scope: which surfaces (desktop first, phone later) and which screens are out.

## 2. The screens: `routes.md`

One line per destination: path, at most 20 words on what it is for, and who uses it.

- **Existing app**: read the route table (the app component and the nav sections),
  not the router file. Drop duplicates and non-screens (the same screen under two
  names, background renderers). Mark screens that exist only in some modes.
- **New project**: there are no routes yet, so imagine them from the interview and
  the knowledge files. Ask what each kind of person needs to see and do, then which
  screens that takes. Include the screens apps forget: sign in, first run, the empty
  home, settings, an error. Mark every line *imagined*. The person will change this
  list, and that is cheap now.

## 3. Each screen by behaviour only: `screens/<route-slug>.md`

Under 220 words each: route, one-line summary, who uses it, purpose, what it shows,
what the person can do and what each action causes, the happy path.

- Behaviour and information only. No layout, colour, spacing, icons or component
  names. A description that says "a sidebar with cards" has already designed it.
- Everyday words. Explain any technical idea in one sentence. "The person", not "the
  user".
- Say plainly what does not exist, is half built, or is only reachable from code.
  Mark guesses as guesses.
- End `routes.md` with a **does not exist** list. No direction may draw anything on it as
  if it worked.

Describing many screens is parallel work. If your harness has subagents, give each
area to its own.

## 4. Directions: `directions/<id>.html`

Draw the **same first three screens** (sign in, first run or onboarding, home) in
**three to five directions that are genuinely different**: different structure,
density, typography, material and colour, not one layout in different paints. If you
put the directions side by side and they read as one theme, start again.

- Clean context matters more than anything else here. Each direction is drawn from
  `brief.md` and the three screen descriptions only: not from the existing app, not
  from your notes, and not from the other directions. With subagents, give each
  direction its own subagent and only those files. Without them, write each direction
  before rereading any other.
- Strip your own grouping headings from anything a designer reads, and shuffle the
  screen list, or every direction inherits your structure.
- Each direction declares its tokens in `:root` and `.dark` with the shadcn names, and
  draws controls at shadcn metrics (see SKILL.md). Being radical in page shape, type,
  colour and material is the point. Inventing controls the app cannot have is not.
- `<title>` is the direction's name in two or three plain words ("Quiet paper",
  "Dense console"), and the top of the page says in one sentence what the direction
  is betting on.
- After the ordinary directions, add a wild one when the person wants to be surprised,
  the brief says "unlike anything", or the first batch felt samey: a canvas scene or a
  3D one that breaks the control rules on purpose. Read `references/wild.md` first.
- Expect the first batch to miss. Rejected directions stay on disk. Write a new batch
  as `-v2` of the folder, against the person's own words about what was wrong.

## 5. The pick

When the person picks a direction (in the design view, or in words):

- `tokens.md`: the palette for light and dark, type families and scale, radius, spacing
  rhythm, and shadows, as the shadcn token values. This becomes `themes/<name>.json`
  at hand-over.
- `decisions.md`: what was picked, what was rejected and why, in their words.
- The shell: navigation, header, content area and the assistant's place, drawn once
  as `pages/00-shell.html`. Every page copies it.

## 6. Pages, group by group: `pages/NN-<route-slug>.html`

Take about five related screens at a time. Each group:

- Starts from the current shell and tokens, and from only those screens' descriptions.
- Is drawn as one family with shared patterns, not as unrelated pages.
- Is the screen and nothing else: no notes, captions or explanations beside the frame.
  The build reads the page as it is. Reasons go in `decisions.md`.
- Draws `ready`, `empty` and `problem` states where the screen has them (the preview
  contract in SKILL.md), and only things that exist or are marked *proposed*.
- Adds to `gaps.md` what the product lacks for these screens, and to `decisions.md`
  what was built and why.
- Is opened once in the design view to check it renders in light and dark at desktop
  width, then shown.

Groups can run in parallel only when each has its own folder. Merge them into the set
as a new version.

## 7. Navigation

Once most pages exist, look at all the one-liners together (shuffled) and propose the
structure: the top-level places, how deep each goes, how someone finds anything, and
what is hidden from people who do not need it. Redraw the shell from it as a new
version.

## 8. Honesty

- A feature that does not exist is drawn only when marked *proposed* on the page, and
  it is listed in `gaps.md`.
- Check claims against the code or the knowledge files before drawing them. A
  subagent's report is data, not authority.

## Pitfalls seen

- A page that reused the shell's attribute names navigated the whole set away when a
  button was clicked. Prefix everything you add with `x-`.
- A class name equal to a shell class silently restyled the page.
- Smooth scrolling made controls jump and lose focus. Leave it off.
- The top bar must stay one line, and the assistant one slim line. Height is the
  scarcest thing on a builder's screen.
