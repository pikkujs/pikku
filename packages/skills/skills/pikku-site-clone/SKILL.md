---
name: pikku-site-clone
description: >-
  Clone, copy or recreate an existing website faithfully (look, layout, colours, fonts, copy, pictures, menu, page structure): capture every page of the original from the rendered page (HTML, structure, layout of columns and pictures, screenshots at phone, laptop and large-screen widths, small tiles you can look at), build the layout first and then the style, and compare each page with the original after you build it. Use whenever a request says to clone, copy, replicate or recreate a site or page.
installGroups: [core]
---

# Cloning a site faithfully

The person who asked will put the original and your site side by side, page by page, on a phone, a laptop and a large
screen, and look at layout first: how many columns a section has, which picture sits beside which text, how big the
pictures are, how tall the page is, then colours, type and copy. Text alone does not carry the layout: capture it from
the rendered page, build the layout first, style second, and check every page against the original.

The scripts are in this skill's `scripts/` folder; run them, do not rewrite them. They need a Chromium and its Playwright
module: `PIKKU_CHROMIUM` is the path of the chrome binary and `PLAYWRIGHT_CORE` the path of the playwright-core module
(the environment you work in sets both; if `echo $PIKKU_CHROMIUM` is empty there is no browser here, use the text-only
route at the end). Screenshot copies and tiles need ImageMagick (`convert`).

```bash
SC=<this skill's folder>/scripts/site_capture.mjs
```

## 1. The page list

```bash
node $SC pages https://the-site.example > reference/pages.txt
```

It reads robots.txt and the sitemap (and the sitemaps it points to), then adds every same-site link it finds by following
links. That list is your to-do list: a page not on it is a page you will miss.

## 2. Capture the original, once, before you build

```bash
node $SC capture reference --tiles @reference/pages.txt        # 1440, 390 and 1920 wide by default; slow (a minute or two per page): run it in the background
```

For every page this writes into `reference/`: `<page>.html` (as served), `<page>.json` (title, description, menu in order,
headings with computed sizes, text, colours by use, fonts by use, CSS breakpoints), `<page>-<width>.layout.json` (the
layout, see `references/layout.md`), `<page>-<width>.png` (the full-page screenshot) and `small/<page>-<width>-<n>.png`
(the screenshot cut into tiles about 1024 px tall and 768 px wide, 390 for the phone: about 1000 image tokens each or
less). Capturing takes a minute or two per page and width: run it in the background and carry on reading.

Read the JSON files before you build. `*.layout.json` says, per page and width, how many sections it has, how many columns
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
  the same pictures (download the originals from their addresses in `<page>.json`; keep their proportions).
- Pages carry their content in the server-rendered HTML (data loaded on the server, not after the page loads).

## 4. Compare after every page

```bash
node $SC shot mine http://localhost:<port>/<path> --width 1440      # one page, one width: a screenshot and tiles, in seconds
node $SC compare reference mine --page <page> --width 1440          # section-by-section differences and a match score
```

`compare` lines up the original's sections with yours from the top of the page and says, in words, where they differ:
sections that are one column in yours and two in the original, a picture on the wrong side or much smaller or larger, sections
yours lacks or has extra, and how much taller or shorter your page is. The `match` number (0 to 1) goes up as those differences
go away. Fix the biggest differences first; they are almost always the layout (columns, picture size and side), not the colours.
Run `shot` at 390 and 1920 too (`--width 390`) before you move on: the phone layout is its own layout.

Then look at the tiles to see what the numbers mean: open the original's `reference/small/<page>-1440-0.png` and yours
`mine/small/<page>-1440-0.png` with your file reader. Looking costs tokens: at most 4 tiles per check, only the page you just
built, and about 40 tile reads in the whole job; use `compare` for everything else.

When all pages are built, run the site check once and fix what it lists:

```bash
node $SC check http://localhost:<port> reference
```

It fetches every page of the original's list from your site and reports pages that do not answer 200, pages with almost no
text in the server-rendered HTML (blank, or filled in by script), and links on the page that lead nowhere.

## If there is no browser

Fetch each page with `curl -sL -A 'Mozilla/5.0' <url>`, read the HTML for headings, menu, colours, fonts and the
`@media (max-width: …)` rules in the stylesheets, and build from those. You cannot see or measure the layout this way,
so say so in your notes.
