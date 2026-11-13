# Reading `<page>-<width>.layout.json`

All numbers are shares of the page: `x`, `w` of its width, `y`, `h` of its height.

- `doc`: `{ w, h }` page size in pixels at that screen width.
- `counts`: `sections`, `images`, `textBlocks`, `multiColumnSections`.
- `bands`: the page cut into stretches (sections) from top to bottom: `y0`/`y1`, `cols` (how many side-by-side blocks the
  stretch has: 1 is a single column, 2 is two blocks beside each other), `fullBleed` (a picture runs across the whole
  width), `images` (each with its box and `side`: `left` or `right` of the text, `inline` when the stretch is one column),
  `textBlocks`.
- `images`: every picture of 40 px or more with its box, address and natural size.

How to use it: for each band build a row: `cols` equal or proportioned columns, pictures in the boxes given, text beside
them. A page whose bands all have `cols: 1` is a single column; if the original has bands with `cols: 2` or more, yours must too.
Compare heights: a page twice as tall as the original has too much space or too small a layout.
