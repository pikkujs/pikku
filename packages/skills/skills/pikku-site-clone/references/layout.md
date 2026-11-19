# The layout file

`<page>-<width>.layout.json` is written for every page at every capture width. It is what the rendered page looked like
in boxes: no text, no colours. Read it to decide how many columns a section has and where its pictures sit.

All positions and sizes are fractions of the page: `x` and `w` of the page width, `y` and `h` of the page height, so
`{ "x": 0.5, "w": 0.5 }` is the right half. `doc` gives the page's size in pixels to turn them back.

| Key | Meaning |
|---|---|
| `viewport` | The width the page was captured at. |
| `doc` | `{ w, h }`: the scroll width and the full height in pixels. `w` above `viewport` means something overflows sideways. |
| `bands` | The page's sections, top to bottom. |
| `images` | Every picture, video and CSS background image of at least 40 px each way, with `src`, its `natural` size `[w, h]` and `background: true` when it is a CSS background. |
| `counts` | `sections`, `images`, `textBlocks` and `multiColumnSections`, to compare two captures at a glance. |

## A band

| Key | Meaning |
|---|---|
| `y0`, `y1` | Where the section starts and ends. |
| `cols` | How many columns of content it has. 2 or more is a side-by-side layout. |
| `fullBleed` | A picture spans more than 90% of the page width. |
| `images` | The pictures in it, each with `side`: `left` or `right` of the text in a multi-column band, `inline` in a single column. |
| `textBlocks` | How many blocks of text it holds. |

## Using it

- Build the sections in the same order, with the same `cols`, before touching colours or type.
- Put each picture on its `side`, at about its `w` of the page.
- Compare `doc.h` with your own page: a ratio far from 1 means too much space or missing content.
