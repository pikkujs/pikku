---
name: pikku-site-clone
description: >-
  Clone, copy or recreate an existing website faithfully (look, layout, colours, fonts, copy, pictures, menu, page structure): capture every page of the original from the rendered page (HTML, structure, layout of columns and pictures, screenshots at phone, laptop and large-screen widths, small tiles you can look at), build the layout first and then the style, and compare each page with the original after you build it. Also covers planning the work (what to file, in which order) when a brief names a site to rebuild or to free from outside services. Use whenever a request says to clone, copy, replicate, recreate or convert a site or page.
installGroups: [core]
---

# Cloning a site faithfully

The person who asked will put the original and your site side by side, page by page, on a phone, a laptop and a large
screen, and look at layout first: how many columns a section has, which picture sits beside which text, how big the
pictures are, how tall the page is, then colours, type and copy. Text alone does not carry the layout: capture it from
the rendered page, build the layout first, style second, and check every page against the original.

```bash
REF=artifacts/references/<site>        # <site> = the original's host name, e.g. www.the-site.example
SC=<this skill's folder>/scripts/site_capture.mjs   # for the quick checks in step 4
```

The reference is an artifact of the project: it lives in `artifacts/references/<site>/` at the project root, and every
command below reads it from there.

## Planning a clone (what to file)

A brief that names a site is planned from what the site holds, not from its address. Before filing anything, follow the
`pikku-site-archaeology` skill: look at every page, and write what you find into `knowledge/site/` (notes only, no code),
starting with `knowledge/site/index.md`. `pikku changes file --plan` refuses a plan that names a site while those notes do not exist.
Then file the plan from the notes, with the general rules of the `pikku-changes` skill, and these on top:

- The data change stores what `things-kept.md` and `forms.md` say, in the currency and languages `prices-and-languages.md` says,
  and the plan covers every form and page you found.
- A clone needs its look first: after the data change, a capture change (`artifacts`: run
  `pikku ui pages capture <url> --out artifacts/references/<site>`, done when every page on the list has its screenshots and
  style.json there and the pictures are in its `pictures/` folder), then a frame change (`frontend`: header, footer, theme;
  depends on the capture). Every page change depends on the frame change, so no page is built before the capture and the frame exist.
- Every `frontend` change lists the pages it builds in `"pages"`, as route paths: `"pages": ["/", "/about"]`. At most 5 pages per
  change. `pikku changes done` compares exactly those pages with the original and refuses until each one matches.
- Pages that share a template are one change, not one change each: every product page of a shop, every collection, every article,
  every event. Write one change for the template, list two or three of its routes as `"pages"` to check it on, and say in the body how
  many pages follow it. The catalogue (the products, the articles) belongs in the data change as records, not in pages. A plan of
  dozens of changes with one page each is a plan nobody can build or review.
- A page the original does not have (an owner screen, a sign-in, an admin list, a page that is new in the rebuilt site) cannot be
  compared: list it in `"newPages"`, not in `"pages"`, e.g. `"newPages": ["/app/calendar"]`. A change with only new pages is not
  held to a compare.
- The starter's `/` redirects to the owner login, and its sign-in and shell carry the starter's own wording ("Cloud Starter").
  The frame change makes `/` serve the site's main page and replaces every starter string in `apps/app/messages` with the site's
  own, so a visitor never lands on a login screen and the owner area says whose it is.

## 1. Capture the original, once, before you build

Run this command. Do not write your own capture script: `pikku changes done` refuses page changes of a clone until this
reference exists.

```bash
mkdir -p $REF && pikku ui pages capture https://the-site.example/ --out $REF > $REF/capture.log 2>&1 &   # slow: a minute or two per page; carry on reading
```

It finds every page (robots.txt, the sitemaps, then same-site links) and writes the list to `$REF/pages.txt`. That list
is your to-do list. Then, for every page, it writes into `$REF/`: `<page>.html` (as served), `<page>.json` (title,
description, menu in order, headings with computed sizes, text, colours by use, fonts by use, CSS breakpoints, pictures),
`<page>-<width>.layout.json` (the layout, see `references/layout.md`), `<page>-<width>.style.json` (colours and fonts of
the page background, header, headings, first paragraph and button), `<page>-<width>.jpg` (the full-page screenshot) and
`small/<page>-<width>-<n>.jpg` (tiles about 1024 px tall: about 1000 image tokens each or less). Widths are 1440, 390 and
1920. It downloads the original pictures into `$REF/pictures/`. `$REF/pictures/index.json` maps each original address to
its file. Each picture in `<page>.json` has its `file`. Only some pages: `--page /,/about`.

It needs a browser: `PLAYWRIGHT_CHROMIUM_PATH` (or `PIKKU_CHROMIUM`) names the chrome binary when Playwright has none.
If the command says there is no browser, use the text-only route at the end.

## 2. Read it before you build

Read the JSON files. `*.layout.json` says, per page and width, how many sections it has, how many columns
each section has, where every picture sits and how big it is (as shares of the page width and height), which side of the
text it is on, and which pictures run edge to edge. That is the layout; the tiles let you look at it.

## 3. Build the layout first, then the style

- For each page, start from its `layout.json` at 1440 and 390 (and 1920): sections in the same order, the same number of
  columns per section (rows of side-by-side blocks, not one long column), each picture in the same place with the same
  proportions and the same side of its text. Build that with grid or flex rows and columns that collapse where the
  original's CSS breakpoints are (`breakpoints` in `<page>.json`).
- Then style it from the same files: the main background, text colour and accent colours from `coloursByUse` go into the
  project's theme tokens, and the fonts from `fontsByUse` into its theme fonts. Heading sizes keep the original's proportion.
- Same menu labels in the same order, same titles and descriptions, same headings in the same order with the same copy,
  the same pictures: copy them from `$REF/pictures/` into the app's public folder and keep their proportions.
- Pages carry their content in the server-rendered HTML (data loaded on the server, not after the page loads).

## 4. Compare after every page

```bash
pikku ui pages compare --reference $REF --page <page>   # every width in $REF; starts the app's dev server if it is not up
```

It photographs your page at each width the reference has, writes `<page>-<width>.diff.png` (original | changed pixels in
red | yours) and `report.json` under `artifacts/compare/<app>/` (or `--out`), and prints the changed-pixel share, both page
heights, the style differences and the biggest section differences, worst first. A reference page your app has no route for is
reported MISSING (`home` and `index` are `/`; when your paths differ, put `{ "<page>": "/your/path" }` in `$REF/map.json`).
Read the `style` lines first and fix those first: they say what differs without an image (`h1: original 56px 700 #a3132f
center; yours 40px 300 #111111 left`, `page background: original #ffffff; yours #fdf3f1`). Then open the diff image of the
worst page: left the original, middle red where pixels differ, right yours; a red band from some height down means your page
is shorter or longer from there. A page change is done only when this passes: `pikku changes done` refuses a change that
touched pages until a compare made after your last commit has each touched page at every width within 40% changed pixels
(`pagesCompare.threshold`). Commit, compare, then `done`. A waiver is only for phone widths (under 1000 px) that cannot
match: `pikku changes done ... --waive "<why, 30+ characters>"`; desktop widths must pass.
For a quick look at one width while you build, the script still works:

```bash
node $SC shot mine http://localhost:<port>/<path> --width 1440      # one page, one width: a screenshot and tiles, in seconds
node $SC compare $REF mine --page <page> --width 1440          # section-by-section differences and a match score
```

`compare` lines up the original's sections with yours from the top of the page and says, in words, where they differ:
sections that are one column in yours and two in the original, a picture on the wrong side or much smaller or larger, sections
yours lacks or has extra, and how much taller or shorter your page is. The `match` number (0 to 1) goes up as those differences
go away. Fix the biggest differences first; they are almost always the layout (columns, picture size and side), not the colours.
Run `shot` at 390 and 1920 too (`--width 390`) before you move on: the phone layout is its own layout.

Then look at the tiles to see what the numbers mean: open the original's `$REF/small/<page>-1440-0.jpg` and yours
`mine/small/<page>-1440-0.jpg` with your file reader. Looking costs tokens: at most 4 tiles per check, only the page you just
built, and about 40 tile reads in the whole job; use `compare` for everything else.

The site check has two parts. The quick one (no browser) runs on every page of the original's list:

```bash
node $SC check http://localhost:<port> $REF
```

it reports pages that do not answer 200, pages with almost no text in the server-rendered HTML (blank, or filled in by script), and
links that lead nowhere. The browser one opens a page at 390, 1440 and 1920 px and reports horizontal overflow (a sideways scrollbar),
broken pictures and script errors, and prints only problems:

```bash
node $SC check http://localhost:<port> $REF --page <page>          # one page, a few seconds
node $SC check http://localhost:<port> $REF --all > check.txt &    # every page, 4 at a time: run it in the background, read check.txt later
```

## If there is no browser

Fetch each page with `curl -sL -A 'Mozilla/5.0' <url>`, read the HTML for headings, menu, colours, fonts and the
`@media (max-width: …)` rules in the stylesheets, and build from those. You cannot see or measure the layout this way,
so say so in your notes.

## The done gate for pages

In a project with a reference (`artifacts/references/<site>/`), a change that touched pages is done
only when `pikku ui pages compare --reference artifacts/references/<site> --page <ids>`, run after
your last commit, has every touched page at every width within the threshold; otherwise `done`
refuses and says which pages, by how much, and the command. Fix the `style` lines of the compare
first (they name the size, weight, colour and alignment that differ), then open the
`<id>-<width>.diff.png` of the worst page (original | red where pixels differ | yours); commit,
compare again. A waiver is only for phone widths (under 1000 px):
`done ... --waive "<why it cannot match, 30+ characters>"`; desktop widths must pass.
