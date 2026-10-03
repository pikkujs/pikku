# Building from a reference

These apply only when the user names something that already exists: a live site, a W3C design
tokens file, a site to rebuild. With no reference, choose a preset from the domain instead.

## Match an existing design

1. **Extract.** Read the design off the source rather than eyeballing it:

   ```bash
   pikku design extract --url https://acme.example        # needs Playwright's Chromium
   pikku design extract --file design/tokens.json         # W3C DTCG tokens
   ```

   It prints a `profile` (`colors`: primary/secondary/accent/background/surface/text, `fonts`:
   heading/body, `structure` hints: `radius`, `shadowStrength`, `density`, `borders`, and `notes`)
   plus the `theme` input it implies. An empty colour means nothing confident was found; choose one.
   The profile's background maps to `--page` and its text to `--ink`.

2. **Pick the structure the hints describe.** Soft shadow and large radius: `aurora` or `breeze`.
   Bold borders and hard shadows: `brutalist`. Compact density: `monopro`. Near-black background:
   a dark-first preset.

3. **Apply**, either in one step or by hand when you want to reconcile noisy values:

   ```bash
   pikku design extract --url https://acme.example --preset breeze --apply
   pikku theme apply --preset breeze --primary '#0B6E99' --font-heading 'Manrope' --font-body 'Manrope' --page '#F7F5F0' --ink '#1C2A33'
   ```

   You are the art director: the profile is measured signal, not a finished theme. Check the
   extracted page and ink against each other and against the primary for 4.5:1 before applying.

4. **Build the layout craft the reference shows.** Colours, fonts, radius and shadow travel through
   the theme. What no token carries (an asymmetric grid, a bespoke type scale, a masked image edge,
   a hover reveal) goes in utility classes on shadcn components (or a small CSS file for what utilities cannot express), with theme variables
   for every colour.

## Rebuild an existing site

When the user wants their site rebuilt or improved, not just matched:

1. **Crawl the content** on your own Cloudflare account (`CLOUDFLARE_ACCOUNT_ID`,
   `CLOUDFLARE_API_TOKEN`):

   ```bash
   pikku design crawl https://acme.example --max-pages 20
   ```

   Each page comes back as `{ url, title, markdown, images }`. The markdown is the real copy to
   rebuild from; the images are downloaded into the app's `public/crawled/` and referenced by local
   path (`/crawled/03-hero.jpg`).

2. **Inventory the images before writing a page.** List `public/crawled/`. If it is empty (a
   JavaScript-only site, failed downloads), fetch stock photography with your
   `UNSPLASH_ACCESS_KEY`:

   ```bash
   pikku design images "harbour cafe interior" --count 8 --orientation landscape
   ```

   Photos land in `public/stock/`, served at `/stock/…`, with the photographer credit Unsplash
   requires; show the credit.

3. **Match the brand** with the recipe above on the same URL.

4. **Make the home page image-led**: a full-bleed hero on the strongest photo, and a real image
   anchoring each major section. A marketing rebuild with no photography is a failed rebuild.

5. **Build the other pages from blocks** (`pikku blocks list --tag heroes|features|faq|contact`,
   `pikku blocks show <Name> --out <dir>`), fill them with the crawled copy and swap in the matching
   photos. Keep the meaning, discard the dated layout.

If the crawl returns thin markdown and no images, say so and rebuild from the brief rather than
inventing content.
