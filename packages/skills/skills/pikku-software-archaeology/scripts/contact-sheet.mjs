#!/usr/bin/env node
/**
 * Build a parity contact sheet.
 *
 *   node contact-sheet.mjs <sheet.json> [out.html]
 *
 * The layout is not a design decision to make per project — it is the format the
 * reviewer already knows how to read, so it is baked in here and the JSON only
 * supplies content. See references/contact-sheet.schema.json for the contract and
 * references/pixel-parity.md for how the evidence is gathered.
 *
 * Images are downscaled, re-encoded and inlined as data URIs, because a published
 * artifact is one file and a relative <img src> in it resolves to nothing. That is
 * also why there is a byte budget: the ceiling is 16MB rendered, and base64 costs
 * a third on top of every image.
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, resolve, extname } from 'node:path'
import { tmpdir } from 'node:os'

const [, , sheetPath, outPath = 'contact-sheet.html'] = process.argv
if (!sheetPath) {
  console.error('usage: contact-sheet.mjs <sheet.json> [out.html]')
  process.exit(2)
}

const sheet = JSON.parse(readFileSync(sheetPath, 'utf8'))
const base = dirname(resolve(sheetPath))

const DEFAULT_STATUSES = [
  { id: 'ok', label: 'Match', legend: 'same screen, anchors within a pixel or two', band: 'Nothing here needs a second look.' },
  { id: 'warn', label: 'Partial', legend: 'the screen is there, something on it is not', band: 'Built and reachable, with a difference named under it.' },
  { id: 'bad', label: 'Not done', legend: 'no counterpart on the rebuild', band: 'Live has this screen and the rebuild does not.' },
  { id: 'open', label: 'Built, unverified', legend: 'rebuilt, no live capture to hold it against', band: 'No side-by-side exists, so nobody has checked these.' },
]

const statuses = sheet.statuses?.length ? sheet.statuses : DEFAULT_STATUSES
const viewports = sheet.viewports
if (!Array.isArray(viewports) || !viewports.length) {
  console.error('sheet.viewports must list at least one viewport')
  process.exit(2)
}

const render = {
  maxWidth: 1100,
  maxHeight: 4000,
  quality: 78,
  format: 'auto',
  budgetBytes: 15_000_000,
  autoDegrade: true,
  ...(sheet.render ?? {}),
}

/* ---------------------------------------------------------------- escaping */

// Prose fields carry inline markup on purpose (a <code> route, an <em> aside),
// so they go through raw(). Everything else is escaped: a screen name with an
// ampersand in it must not be able to break the document.
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const raw = (s) => String(s ?? '')

/* ------------------------------------------------------------ image loading */

const have = (bin) => {
  try {
    execFileSync('which', [bin], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
const MAGICK = have('magick') ? 'magick' : have('convert') ? 'convert' : null
if (!MAGICK) {
  console.error(
    'ImageMagick not found (`magick` or `convert`). Install it — full-page captures are\n' +
      'routinely 20,000px tall and inlining them raw blows the 16MB artifact ceiling on the\n' +
      'first screen.',
  )
  process.exit(2)
}

const work = mkdtempSync(`${tmpdir()}/contact-sheet-`)
const cache = new Map()

/**
 * Downscale, cap the height and encode one capture.
 *
 * The height cap is not cosmetic. A full-page capture of a long list can be
 * 25,000px; nobody reads that in a 500px-tall pane, and the pixels cost more
 * than every other screen combined. It is cut at the TOP of the page (where the
 * layout being compared actually is) and the pane says so.
 */
function encode(relPath, { isDiff, quality, maxWidth }) {
  const key = `${relPath}|${quality}|${maxWidth}`
  if (cache.has(key)) return cache.get(key)

  const abs = resolve(base, relPath)
  if (!existsSync(abs)) {
    console.error(`  missing image: ${relPath}`)
    return null
  }

  // Diff maps stay PNG: they are flat colour, they compress well, and JPEG
  // ringing around every edge invents differences the measurement did not find.
  const png = isDiff || render.format === 'png'
  const fmt = render.format === 'jpeg' ? 'jpeg' : png ? 'png' : 'jpeg'
  const out = `${work}/${Buffer.from(key).toString('hex').slice(0, 32)}.${fmt}`

  const [w, h] = execFileSync(MAGICK, ['identify', '-format', '%w %h', `${abs}[0]`], { encoding: 'utf8' })
    .trim()
    .split(/\s+/)
    .map(Number)

  const scale = Math.min(1, maxWidth / w)
  const cappedAt = Math.round(render.maxHeight / scale)
  const truncated = h > cappedAt

  const args = [`${abs}[0]`]
  if (truncated) args.push('-crop', `${w}x${cappedAt}+0+0`, '+repage')
  if (scale < 1) args.push('-resize', `${maxWidth}x`)
  args.push('-strip')
  if (fmt === 'jpeg') args.push('-quality', String(quality), '-sampling-factor', '4:2:0', '-interlace', 'JPEG')
  else args.push('-define', 'png:compression-level=9')
  args.push(out)
  execFileSync(MAGICK, args)

  const value = {
    uri: `data:image/${fmt};base64,${readFileSync(out).toString('base64')}`,
    truncated,
    height: h,
    width: w,
  }
  cache.set(key, value)
  return value
}

/* ---------------------------------------------------------------- rendering */

const paneHtml = (pane, side, label, opts) => {
  const tagClass = side === 'a' ? 'tag' : side === 'b' ? 'tag b' : 'tag d'
  if (!pane || pane.missing || !pane.image) {
    return `<figure class="pane pane-${side}">
        <figcaption><span class="tag n">${esc(side.toUpperCase())}</span> ${esc(label)}</figcaption>
        <div class="nopane"><p>${raw(pane?.missing ?? 'No capture.')}</p></div>
      </figure>`
  }
  const img = encode(pane.image, { isDiff: side === 'd', ...opts })
  if (!img) {
    return `<figure class="pane pane-${side}">
        <figcaption><span class="tag n">${esc(side.toUpperCase())}</span> ${esc(label)}</figcaption>
        <div class="nopane"><p>Image file missing at build time: <code>${esc(pane.image)}</code></p></div>
      </figure>`
  }
  const cap = pane.caption ? `<span class="file mono">${esc(pane.caption)}</span>` : ''
  const cut = img.truncated
    ? `<p class="cut mono">top ${render.maxHeight}px of ${img.height}px shown</p>`
    : ''
  return `<figure class="pane pane-${side}">
        <figcaption><span class="${tagClass}">${esc(side.toUpperCase())}</span> ${esc(label)}${cap}</figcaption>
        <div class="shot"><img loading="lazy" alt="${esc(label)}" src="${img.uri}"></div>${cut}
      </figure>`
}

const dClass = (row) => {
  if (row.d) return row.d
  const t = String(row.delta ?? '').trim()
  if (t === '0' || t === '0px' || t === '') return 'zero'
  if (t === '—' || t === '-' || /unmeasur/i.test(t)) return 'none'
  return 'near'
}

const anchorsHtml = (rows) =>
  !rows?.length
    ? ''
    : `<div class="tablewrap"><table class="anchors">
        <thead><tr><th>Anchor</th><th>${esc(sheet.sides.a.label)}</th><th>${esc(sheet.sides.b.label)}</th><th>&Delta;</th></tr></thead>
        <tbody>${rows
          .map(
            (r) =>
              `<tr><th scope="row">${esc(r.name)}</th><td class="mono">${esc(r.a)}</td><td class="mono">${esc(
                r.b,
              )}</td><td class="mono d ${dClass(r)}">${esc(r.delta ?? '')}</td></tr>`,
          )
          .join('')}</tbody></table></div>`

function captureHtml(screen, vp, opts) {
  const cap = screen.captures?.[vp.id]
  if (!cap) {
    // Explicit, not silent. A viewport nobody captured must not look like a
    // viewport that matched, and it must never fall back to another width's image.
    return `<div class="vp" data-vp="${esc(vp.id)}">
        <div class="nopane wide"><p>Not captured at ${esc(vp.label)}.</p></div>
      </div>`
  }
  const solo = !cap.a?.image || !cap.b?.image
  return `<div class="vp${solo ? ' solo' : ''}" data-vp="${esc(vp.id)}" data-mode="split" data-delta="${esc(
    cap.delta ?? '',
  )}">
        <div class="stage">
          ${paneHtml(cap.a, 'a', sheet.sides.a.label, opts)}
          ${paneHtml(cap.b, 'b', sheet.sides.b.label, opts)}
          ${cap.diff ? paneHtml(cap.diff, 'd', 'Difference', opts) : ''}
        </div>
        ${anchorsHtml(cap.anchors)}
      </div>`
}

function screenHtml(screen, num, opts) {
  const st = statuses.find((s) => s.id === screen.status) ?? { id: screen.status, label: screen.status }
  const first = screen.captures?.[viewports[0].id]
  const anySolo = viewports.some((vp) => {
    const c = screen.captures?.[vp.id]
    return c && (!c.a?.image || !c.b?.image)
  })
  const deltas = viewports
    .map((vp) => screen.captures?.[vp.id]?.delta)
    .filter(Boolean)
  const deltaChip = first?.delta ?? deltas[0]

  const vpSeg =
    viewports.length > 1
      ? `<div class="seg vpseg" role="group" aria-label="Viewport">${viewports
          .map(
            (vp, i) =>
              `<button type="button" data-vp="${esc(vp.id)}"${i === 0 ? ' class="on"' : ''}>${esc(vp.label)}</button>`,
          )
          .join('')}</div>`
      : `<span class="chip mono">${esc(viewports[0].label)}</span>`

  const modeSeg = `<div class="seg modeseg" role="group" aria-label="Comparison">
          <button type="button" data-mode="split" class="on">Side by side</button>
          <button type="button" data-mode="diff">Overlay</button>
          <button type="button" data-mode="a">${esc(sheet.sides.a.label)}</button>
          <button type="button" data-mode="b">${esc(sheet.sides.b.label)}</button>
        </div>`

  return `<section class="screen${anySolo ? ' solo' : ''}" id="${esc(screen.id)}" data-vp="${esc(viewports[0].id)}">
      <header class="screenhead">
        <div class="sh-id">
          <span class="num mono">${String(num).padStart(2, '0')}</span>
          <h2>${esc(screen.name)}</h2>
          ${screen.route ? `<p class="route mono">${esc(screen.route)}</p>` : ''}
        </div>
        <div class="sh-meta">
          <span class="chip ${esc(st.id)}">${esc(st.label)}</span>
          ${deltaChip ? `<span class="chip delta mono">${esc(deltaChip)}</span>` : '<span class="chip delta mono" hidden></span>'}
          ${vpSeg}
          ${modeSeg}
        </div>
      </header>
      ${screen.note ? `<p class="note">${raw(screen.note)}</p>` : ''}
      ${viewports.map((vp) => captureHtml(screen, vp, opts)).join('\n      ')}
      ${
        screen.gaps?.length
          ? `<div class="gaps"><h4>Known differences</h4><ul>${screen.gaps
              .map((g) => `<li>${raw(g)}</li>`)
              .join('')}</ul></div>`
          : ''
      }
    </section>`
}

function build(opts) {
  cache.clear()

  const ordered = []
  for (const st of statuses) {
    const group = sheet.screens.filter((s) => s.status === st.id)
    if (group.length) ordered.push({ st, group })
  }
  const loose = sheet.screens.filter((s) => !statuses.some((st) => st.id === s.status))
  if (loose.length) {
    console.error(`  ${loose.length} screen(s) have a status no band declares: ${loose.map((s) => s.id).join(', ')}`)
  }

  let n = 0
  const numbers = new Map()
  for (const { group } of ordered) for (const s of group) numbers.set(s.id, ++n)

  const rail = ordered
    .map(
      ({ st, group }) =>
        `<li class="grp"><b>${esc(st.label)}</b><span>${group.length}</span></li>` +
        group
          .map(
            (s) =>
              `<li><a href="#${esc(s.id)}"><span class="mono n">${String(numbers.get(s.id)).padStart(
                2,
                '0',
              )}</span><span class="nm">${esc(s.name)}</span><span class="dot ${esc(s.status)}"></span></a></li>`,
          )
          .join(''),
    )
    .join('')

  const sheetBody = ordered
    .map(
      ({ st, group }) =>
        `<div class="band ${esc(st.id)}">
      <h2>${esc(st.label)}</h2>
      <p>${raw(st.band ?? '')}</p>
      <span class="count mono">${group.length} of ${sheet.screens.length}</span>
    </div>
    ${group.map((s) => screenHtml(s, numbers.get(s.id), opts)).join('\n    ')}`,
    )
    .join('\n    ')

  const legend = statuses
    .map((s) => `<li><span class="dot ${esc(s.id)}"></span> <b>${esc(s.label)}</b> ${esc(s.legend ?? '')}</li>`)
    .join('')

  const origins = [sheet.sides.a.origin, sheet.sides.b.origin].filter(Boolean).join(' · ')
  const vpLine = viewports.map((v) => `${v.label}`).join(' · ')

  return `<title>${esc(sheet.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap">
<style>
${CSS}
</style>

<div class="wrap">
  <header class="masthead">
    <p class="eyebrow">${esc(sheet.eyebrow ?? '')}</p>
    <h1>${esc(sheet.heading.text)}${sheet.heading.em ? ` <em>${esc(sheet.heading.em)}</em>` : ''}</h1>
    <p class="lede">${raw(sheet.lede ?? '')}</p>
    <p class="origins mono">${esc(origins)}${origins && vpLine ? ' &nbsp;·&nbsp; ' : ''}${esc(vpLine)}</p>
    <ul class="legend">${legend}</ul>
  </header>

  <nav class="rail">
    <h3>Screens</h3>
    <ul class="navlist">${rail}</ul>
  </nav>

  <main class="sheet">
    ${sheetBody}
  </main>

  <footer class="colophon">${raw(sheet.colophon ?? '')}</footer>
</div>

<script>
  // The only script on the page: two segmented controls per screen.
  //
  // The viewport choice sets the section's data-vp, and CSS shows the matching
  // .vp block. The delta chip is moved with it, because a chip left showing the
  // desktop measurement while a phone capture is on screen is worse than no chip.
  // The comparison choice is applied to every .vp block at once, so the button
  // that is lit is always the view you are actually looking at.
  for (const screen of document.querySelectorAll('.screen')) {
    const vpseg = screen.querySelector('.vpseg')
    const modeseg = screen.querySelector('.modeseg')
    const chip = screen.querySelector('.chip.delta')
    const showDelta = () => {
      if (!chip) return
      const vp = screen.querySelector('.vp[data-vp="' + screen.dataset.vp + '"]')
      const delta = vp?.dataset.delta || ''
      chip.textContent = delta
      chip.hidden = !delta
    }
    vpseg?.addEventListener('click', (e) => {
      const btn = e.target.closest('button')
      if (!btn) return
      screen.dataset.vp = btn.dataset.vp
      for (const b of vpseg.querySelectorAll('button')) b.classList.toggle('on', b === btn)
      showDelta()
    })
    modeseg?.addEventListener('click', (e) => {
      const btn = e.target.closest('button')
      if (!btn) return
      for (const vp of screen.querySelectorAll('.vp')) vp.dataset.mode = btn.dataset.mode
      for (const b of modeseg.querySelectorAll('button')) b.classList.toggle('on', b === btn)
    })
    showDelta()
  }
</script>
`
}

const CSS = `
:root {
  --paper:#eef2f5; --surface:#ffffff; --sunken:#e3eaef;
  --ink:#0d1a21; --ink-2:#3d525f; --muted:#6f8492;
  --line:#d3dce2; --line-2:#c0ccd5; --accent:#0043f7;
  --ok:#0f6b4f; --warn:#9a5b06; --bad:#8e2f3c; --open:#8a94a0;
  --ok-bg:#dcefe6; --warn-bg:#f7ead6; --bad-bg:#f4dde0; --open-bg:#e4e9ed;
  --shadow:0 1px 2px rgb(13 26 33 / 7%), 0 8px 24px -12px rgb(13 26 33 / 18%);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper:#0b1216; --surface:#131e25; --sunken:#0e171d;
    --ink:#e7eef2; --ink-2:#b3c3cd; --muted:#8298a5;
    --line:#243441; --line-2:#31434f; --accent:#7aa2ff;
    --ok:#6fd3ac; --warn:#e0ab5f; --bad:#e58a97; --open:#8a94a0;
    --ok-bg:#12291f; --warn-bg:#2c2314; --bad-bg:#2c161b; --open-bg:#1b242a;
    --shadow:0 1px 2px rgb(0 0 0 / 40%), 0 8px 24px -12px rgb(0 0 0 / 70%);
  }
}
:root[data-theme="dark"] {
  --paper:#0b1216; --surface:#131e25; --sunken:#0e171d;
  --ink:#e7eef2; --ink-2:#b3c3cd; --muted:#8298a5;
  --line:#243441; --line-2:#31434f; --accent:#7aa2ff;
  --ok:#6fd3ac; --warn:#e0ab5f; --bad:#e58a97; --open:#8a94a0;
  --ok-bg:#12291f; --warn-bg:#2c2314; --bad-bg:#2c161b; --open-bg:#1b242a;
  --shadow:0 1px 2px rgb(0 0 0 / 40%), 0 8px 24px -12px rgb(0 0 0 / 70%);
}

body { background: var(--paper); color: var(--ink); font-family: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.5; }
.mono { font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
a { color: inherit; }

.wrap { display:grid; grid-template-columns:236px minmax(0,1fr); gap:40px; max-width:1560px; margin:0 auto; padding:0 32px 96px; }
.masthead, .colophon { grid-column: 1 / -1; }

.masthead { padding:56px 0 32px; border-bottom:1px solid var(--line); margin-bottom:8px; }
.eyebrow { font-size:.74rem; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); margin:0 0 14px; }
.masthead h1 { font-weight:300; font-size:clamp(2rem, 4vw, 3rem); line-height:1.1; margin:0 0 18px; text-wrap:balance; }
.masthead h1 em { font-style:normal; color:var(--muted); }
.lede { max-width:64ch; color:var(--ink-2); margin:0 0 12px; }
.origins { font-size:.78rem; color:var(--muted); margin:0 0 20px; }
ul.legend { display:flex; flex-wrap:wrap; gap:10px 26px; list-style:none; padding:0; margin:0; font-size:.82rem; color:var(--ink-2); }
ul.legend b { font-weight:600; }
.dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--open); }
.dot.ok { background:var(--ok); } .dot.warn { background:var(--warn); } .dot.bad { background:var(--bad); } .dot.open { background:var(--open); }

.rail { position:sticky; top:20px; align-self:start; max-height:calc(100vh - 40px); overflow:auto; }
.rail h3 { font-size:.72rem; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); margin:0 0 12px; font-weight:600; }
.navlist { list-style:none; padding:0; margin:0; font-size:.82rem; }
.navlist li.grp { display:flex; justify-content:space-between; margin:18px 0 6px; padding-top:8px; border-top:1px solid var(--line); color:var(--muted); font-size:.72rem; text-transform:uppercase; letter-spacing:.08em; }
.navlist li.grp:first-child { margin-top:0; border-top:0; padding-top:0; }
.navlist li > a { display:grid; grid-template-columns:26px 1fr 8px; align-items:center; gap:8px; padding:3px 0; text-decoration:none; color:var(--ink-2); }
.navlist li > a:hover { color:var(--accent); }
.navlist .n { color:var(--muted); font-size:.72rem; }
.navlist .nm { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

.sheet { display:flex; flex-direction:column; gap:64px; min-width:0; padding-top:32px; }

.band { display:grid; grid-template-columns:auto 1fr auto; align-items:baseline; gap:16px; padding-bottom:10px; border-bottom:2px solid var(--ink); }
.band h2 { margin:0; font-size:1.15rem; font-weight:600; }
.band p { margin:0; color:var(--muted); font-size:.86rem; }
.band .count { color:var(--muted); font-size:.78rem; }
.band.ok h2 { color:var(--ok); } .band.warn h2 { color:var(--warn); } .band.bad h2 { color:var(--bad); } .band.open h2 { color:var(--open); }

.screen { scroll-margin-top:24px; }
.screenhead { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:flex-end; gap:16px; padding-bottom:10px; border-bottom:2px solid var(--ink); }
.sh-id { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; min-width:0; }
.sh-id .num { color:var(--muted); font-size:.8rem; }
.sh-id h2 { margin:0; font-size:1.05rem; font-weight:600; }
.sh-id .route { margin:0; color:var(--muted); font-size:.78rem; overflow-wrap:anywhere; }
.sh-meta { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }

.chip { display:inline-block; padding:3px 9px; border-radius:999px; font-size:.72rem; font-weight:500; background:var(--open-bg); color:var(--open); }
.chip.ok { background:var(--ok-bg); color:var(--ok); }
.chip.warn { background:var(--warn-bg); color:var(--warn); }
.chip.bad { background:var(--bad-bg); color:var(--bad); }
.chip.open { background:var(--open-bg); color:var(--open); }
.chip.delta { background:transparent; border:1px solid var(--line-2); color:var(--ink-2); }

.seg { display:inline-flex; border:1px solid var(--line-2); border-radius:7px; overflow:hidden; background:var(--surface); }
.seg button { appearance:none; border:0; background:transparent; color:var(--ink-2); font:inherit; font-size:.74rem; padding:5px 10px; cursor:pointer; border-left:1px solid var(--line-2); }
.seg button:first-child { border-left:0; }
.seg button:hover { color:var(--ink); }
.seg button.on { background:var(--ink); color:var(--surface); }
.seg button:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
.screen.solo .modeseg { display:none; }

.note { max-width:78ch; color:var(--ink-2); margin:14px 0 18px; }

/* One .vp block per viewport; the section's data-vp picks which is on screen. */
.vp { display:none; }
.screen[data-vp="__none__"] .vp { display:none; }
.stage { display:grid; grid-template-columns:1fr 1fr; gap:22px; align-items:start; }
.pane { margin:0; min-width:0; }
.pane-d { display:none; }
figcaption { display:flex; align-items:center; gap:8px; font-size:.74rem; color:var(--muted); margin-bottom:7px; }
.file { margin-left:auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tag { display:inline-grid; place-items:center; width:17px; height:17px; border-radius:4px; font-size:.62rem; font-weight:600; background:var(--ink); color:var(--surface); }
.tag.b { background:var(--accent); color:#fff; }
.tag.d { background:var(--muted); color:var(--surface); }
.tag.n { background:transparent; color:var(--muted); border:1px dashed var(--line-2); }
.shot { background:var(--surface); border:1px solid var(--line); border-radius:8px; overflow:hidden; box-shadow:var(--shadow); }
.shot img { display:block; width:100%; height:auto; }
.cut { margin:6px 0 0; font-size:.7rem; color:var(--muted); }
.nopane { border:1px dashed var(--line-2); border-radius:8px; min-height:180px; display:grid; place-items:center; padding:24px; background-image:repeating-linear-gradient(135deg, transparent 0 9px, var(--sunken) 9px 10px); }
.nopane p { margin:0; max-width:44ch; text-align:center; color:var(--muted); font-size:.82rem; }
.nopane.wide { min-height:120px; }

/* Mode. Scoped to the visible .vp so each width remembers its own choice. */
.vp[data-mode="a"] .pane-b, .vp[data-mode="b"] .pane-a { display:none; }
.vp[data-mode="a"] .stage, .vp[data-mode="b"] .stage { grid-template-columns:minmax(0,1100px); }
.vp[data-mode="diff"] .pane-a, .vp[data-mode="diff"] .pane-b { display:none; }
.vp[data-mode="diff"] .pane-d { display:block; }
.vp[data-mode="diff"] .stage { grid-template-columns:minmax(0,1100px); }
.vp[data-mode="diff"] figcaption { display:none; }

.tablewrap { overflow-x:auto; margin-top:20px; }
table.anchors { border-collapse:collapse; width:100%; font-size:.8rem; }
table.anchors th, table.anchors td { text-align:left; padding:6px 12px 6px 0; border-bottom:1px solid var(--line); }
table.anchors thead th { color:var(--muted); font-weight:500; font-size:.72rem; text-transform:uppercase; letter-spacing:.07em; }
table.anchors tbody th { font-weight:500; color:var(--ink); }
table.anchors td.d { text-align:right; width:64px; padding-right:0; font-variant-numeric:tabular-nums; }
td.d.zero { color:var(--ok); } td.d.near { color:var(--warn); } td.d.none { color:var(--muted); }

.gaps { margin-top:20px; border-left:2px solid var(--line-2); background:var(--surface); padding:14px 18px; border-radius:0 8px 8px 0; }
.gaps h4 { margin:0 0 8px; font-size:.72rem; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); font-weight:600; }
.gaps ul { margin:0; padding-left:18px; color:var(--ink-2); font-size:.86rem; }
.gaps li + li { margin-top:5px; }

.colophon { margin-top:72px; padding-top:20px; border-top:1px solid var(--line); color:var(--muted); font-size:.82rem; max-width:80ch; }

@media (max-width: 1080px) {
  .wrap { grid-template-columns:minmax(0,1fr); gap:24px; padding:0 18px 64px; }
  .rail { position:static; max-height:none; }
  .rail ul { columns:2; }
  .stage { grid-template-columns:minmax(0,1fr); }
}
@media (prefers-reduced-motion: reduce) { * { animation:none !important; transition:none !important; } }
`

// data-vp visibility has to be generated: one rule per declared viewport id.
const vpRules = viewports.map((v) => `.screen[data-vp="${v.id}"] .vp[data-vp="${v.id}"] { display:block; }`).join('\n')

/* -------------------------------------------------------------- the budget */

let quality = render.quality
let maxWidth = render.maxWidth
let html = ''
for (let attempt = 0; ; attempt++) {
  html = build({ quality, maxWidth }).replace('</style>', `${vpRules}\n</style>`)
  const bytes = Buffer.byteLength(html)
  const mb = (bytes / 1e6).toFixed(1)
  if (bytes <= render.budgetBytes || !render.autoDegrade) {
    console.log(`${outPath}: ${mb}MB, ${sheet.screens.length} screens × ${viewports.length} viewport(s), q${quality} @ ${maxWidth}px`)
    if (bytes > render.budgetBytes) {
      console.error(`OVER BUDGET by ${((bytes - render.budgetBytes) / 1e6).toFixed(1)}MB — publishing will be refused.`)
      process.exitCode = 1
    }
    break
  }
  if (quality > 52) quality -= 8
  else if (maxWidth > 620) maxWidth = Math.round(maxWidth * 0.82)
  else {
    console.error(
      `Cannot fit ${mb}MB under ${(render.budgetBytes / 1e6).toFixed(1)}MB even at q${quality} @ ${maxWidth}px.\n` +
        `Every viewport multiplies the image count. Split the sheet — one file per viewport, or one\n` +
        `per band — rather than degrading further; below ~620px a pane stops being evidence.`,
    )
    process.exitCode = 1
    break
  }
  console.log(`  ${mb}MB over budget, retrying at q${quality} @ ${maxWidth}px`)
}

writeFileSync(outPath, html)
rmSync(work, { recursive: true, force: true })
