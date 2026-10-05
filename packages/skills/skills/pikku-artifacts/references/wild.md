# Wild directions: canvas and 3D

Most directions are buildable looks. A wild direction is not. It exists to stretch what
the person thinks the product could feel like, and to give the buildable directions
something to steal from. Add at most one canvas and one 3D direction to a batch, after
the three to five ordinary ones, never instead of them.

## The rules they break, and the ones they keep

- **Broken**: shadcn control metrics, page shape, the grid, even the idea of a page. The
  screen can be a drawing, a space, a moving thing.
- **Kept**: it draws the same first three screens from the same descriptions, with
  their real content and states. Nothing on the does-not-exist list. It is still one
  standalone HTML file with `<title>`, the one-line bet, and "Nothing here is built
  yet". Dark mode and `data-artifact-state` still switch it.
- The page names itself a wild direction at the top: "Wild direction: for inspiration,
  not built as is."
- It must stay responsive. 60 frames a second on a laptop, no fan noise, nothing that
  blocks scrolling, and `prefers-reduced-motion` stops every animation.

## Canvas: `directions/wild-canvas-<id>.html`

A 2D canvas or SVG scene instead of a page of boxes: the timetable as a cliff face
where each slot is a hold, capacity as chalk on a board, a booking as a line drawn
across a day.

- A `<canvas>` sized to its container and to `devicePixelRatio`, redrawn on resize.
  Or inline SVG when the shapes are few and need to be crisp. Use the token colours,
  read with `getComputedStyle(document.documentElement).getPropertyValue('--primary')`,
  so the palette still maps onto a theme.
- Real text stays real HTML laid over the canvas, so it is readable and selectable.
  Draw only the material, the motion and the data shapes.
- Libraries, only when hand-written canvas would be long: `roughjs` for a sketched
  look, `p5` for generative patterns. Load them from `https://cdn.jsdelivr.net/npm/`.

## 3D: `directions/wild-3d-<id>.html`

A three.js scene where the product is a place: the gym's week as a wall you rotate,
sessions as lit volumes that fill as people book, the member's history as a route
climbing upward.

**It needs Blender on the person's machine.** Run `blender --version` first. Without
it, do not draw a 3D direction: say that installing Blender (blender.org, or
`brew install --cask blender`) unlocks one, and draw the canvas direction instead.

With Blender, model in Blender and render in three.js:

1. Write the scene as a Python script, `directions/assets/<id>.py`, using `bpy`: the
   meshes, their names, simple materials. Keep it under a few thousand polygons. Name
   every object after what it shows (`slot-1830`, `wall-tuesday`) so the page can find it.
2. Export it headless:
   `blender --background --python directions/assets/<id>.py -- directions/assets/<id>.glb`,
   with the script ending in
   `bpy.ops.export_scene.gltf(filepath=sys.argv[-1], export_format='GLB')`.
3. Load it in the page from `./assets/<id>.glb`. Only `.glb`, `.png`, `.jpg` and
   `.webp` under `directions/assets/` are served.

```html
<script type="importmap">
  { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.170/build/three.module.js",
                 "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170/examples/jsm/" } }
</script>
<script type="module">
  import * as THREE from 'three'
  import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
</script>
```

- Materials and lights take their colours from the tokens at load time, overriding
  what Blender exported, so dark mode and a theme change recolour the scene.
- Data drives the scene: the page scales, lights or hides the named objects from the
  literal records in the file (a full session glows, an empty one is dim).
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`, and the loop paused when the
  tab is hidden.
- Text and the actions a person takes (book, sign in) stay as HTML over the scene. The
  scene is the backdrop and the data, never the only way to do something.
- Without WebGL the page shows a still render (Blender can write one:
  `bpy.ops.render.render(write_still=True)` to `assets/<id>.png`), never a blank page.

## When the person picks a wild one

It is not built as is. Write in `decisions.md` what they liked about it: the motion, a
material, a way of showing capacity. Then draw a buildable direction that keeps those
ideas inside shadcn controls, as the next version of the folder, and pick that one.
A canvas or 3D element can survive into the app as a single bespoke component (a hero,
a capacity chart, an empty state). Name it as such in `gaps.md`.
