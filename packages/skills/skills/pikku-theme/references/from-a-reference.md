# Building from a reference

These apply only when the user names something that already exists: a live site, a W3C design
tokens file, a site to rebuild. With no reference, choose a preset from the domain instead. The CLI
has no extractor: you read the design off the source and pass it to `pikku ui theme apply`.

## Match an existing design

1. **Read the design off the source.** Open the site (or the tokens file) and note the primary,
   secondary and accent colours, the page background and text colour, and the heading and body
   fonts. Note the structure hints: radius, shadow strength, density, borders.

2. **Pick the structure the hints describe.** Soft shadow and large radius: `aurora` or `breeze`.
   Bold borders and hard shadows: `brutalist`. Compact density: `monopro`. Near-black background:
   a dark-first preset.

3. **Apply.** The page background maps to `--page` and the text to `--ink`:

   ```bash
   pikku ui theme apply --preset breeze --primary '#0B6E99' --font-heading 'Manrope' --font-body 'Manrope' --page '#F7F5F0' --ink '#1C2A33'
   ```

   If the reference is dark, add `--mode dark` (then `--page`/`--ink` are the dark ground and its
   text); without it a dark page is derived as a light one.

   You are the art director: what you read is signal, not a finished theme. Check page and ink
   against each other and against the primary for 4.5:1 before applying.

4. **Build the layout craft the reference shows.** Colours, fonts, radius and shadow travel through
   the theme. What no token carries (an asymmetric grid, a bespoke type scale, a masked image edge,
   a hover reveal) goes in utility classes on shadcn components (or a small CSS file for what utilities cannot express), with theme variables
   for every colour.

## Rebuild an existing site

When the user wants their site rebuilt or improved, not just matched:

1. **Take the copy from the user.** Ask for the pages' text and images, or read the live pages
   yourself. The CLI does not crawl or fetch stock photography; do not invent content or images.

2. **Match the brand** with the recipe above.

3. **Build the pages** from the shadcn components in `src/components/ui/`, filling them with the real
   copy and the images the user supplied. Keep the meaning, discard the dated layout.

If there is no copy and no imagery to work from, say so and rebuild from the brief rather than
inventing content.
