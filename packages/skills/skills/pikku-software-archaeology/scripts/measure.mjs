#!/usr/bin/env node
/**
 * Score a pair of captures and draw its difference map.
 *
 *   node measure.mjs <a.png> <b.png> <diff-out.png>          one pair
 *   node measure.mjs --manifest <manifest.tsv> --out <dir>   every pair in a shoot
 *
 * Prints one TSV row per pair: id, common box, differing pixels, percent.
 *
 * Two things here are load-bearing and were both learned the expensive way.
 *
 * 1. The difference is computed HERE, at capture resolution, and never in the
 *    browser. `mix-blend-mode: difference` over an inverted pane computes
 *    |A + B - 255|: agreement renders white on white AND white on black, every
 *    mid-tone glows, and two visually identical screens produce a blurry overlay
 *    that is simply lying to the reader.
 *
 * 2. Even a correct difference computed on downscaled images is wrong. Capture at
 *    1600, store at 1200, JPEG it, then let the browser lay it out at ~1100: that
 *    is three resamples, each smearing a 1px disagreement across about three, and
 *    the page then reads as "everything is broken". Compute on the originals and
 *    downscale the RESULT.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdirSync, existsSync } from 'node:fs'
import { basename, join, dirname } from 'node:path'

// Amplification. FLOOR discards antialiasing noise, GAIN makes a one-channel
// disagreement visible at all, LEVELS keeps the resulting PNG small enough that
// a few hundred of them fit in one artifact.
const FLOOR = Number(process.env.DIFF_FLOOR ?? 2) // out of 255
const GAIN = Number(process.env.DIFF_GAIN ?? 6)
const LEVELS = Number(process.env.DIFF_LEVELS ?? 16)
// Per-channel threshold for "this pixel actually differs". Below it you are
// scoring JPEG noise, not the rebuild.
const THRESHOLD = Number(process.env.DIFF_THRESHOLD ?? 40) // out of 255
const MAXH = Number(process.env.DIFF_MAXH ?? 3000)

const magick = (() => {
  for (const bin of ['magick', 'convert']) {
    try {
      execFileSync('which', [bin], { stdio: 'ignore' })
      return bin
    } catch {}
  }
  console.error('ImageMagick not found (`magick` or `convert`).')
  process.exit(2)
})()

const size = (f) =>
  execFileSync(magick, ['identify', '-format', '%w %h', `${f}[0]`], { encoding: 'utf8' })
    .trim()
    .split(/\s+/)
    .map(Number)

/**
 * Crop both sides to their common box before comparing.
 *
 * Without this a height delta scores as near-total difference and swamps
 * everything else, which turns a pagination finding into a number nobody can
 * act on. The height delta is reported separately, as the finding it is.
 */
export function measure(aPath, bPath, outPath) {
  const [aw, ah] = size(aPath)
  const [bw, bh] = size(bPath)
  const w = Math.min(aw, bw)
  const h = Math.min(ah, bh, MAXH)
  const box = `${w}x${h}+0+0`

  const shared = [
    `${aPath}[0]`, '-crop', box, '+repage',
    `${bPath}[0]`, '-crop', box, '+repage',
    '-compose', 'difference', '-composite',
  ]

  // Score: threshold each channel, then the mean of the black-and-white result
  // times the pixel count is the number of pixels that really moved.
  const differing = Math.round(
    Number(
      execFileSync(
        magick,
        [
          ...shared,
          '-colorspace', 'Gray',
          '-threshold', `${(THRESHOLD / 255) * 100}%`,
          '-format', '%[fx:mean*w*h]', 'info:',
        ],
        { encoding: 'utf8' },
      ).trim(),
    ),
  )

  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true })
    execFileSync(magick, [
      ...shared,
      '-colorspace', 'Gray',
      '-black-threshold', `${(FLOOR / 255) * 100}%`,
      '-evaluate', 'multiply', String(GAIN),
      '-negate',
      '-colors', String(LEVELS),
      '-define', 'png:compression-level=9',
      outPath,
    ])
  }

  return { w, h, aw, ah, bw, bh, differing, percent: (differing / (w * h)) * 100, heightDelta: bh - ah }
}

/* ------------------------------------------------------------------- main */

const argv = process.argv.slice(2)
if (!argv.length) {
  console.error('usage: measure.mjs <a.png> <b.png> [diff.png]  |  measure.mjs --manifest <tsv> --out <dir>')
  process.exit(2)
}

const flag = (name) => {
  const i = argv.indexOf(name)
  return i === -1 ? null : argv[i + 1]
}

const manifest = flag('--manifest')
if (manifest) {
  const outDir = flag('--out') ?? 'diff'
  mkdirSync(outDir, { recursive: true })
  // manifest.tsv columns: id, viewport, side, route, url, file, iso
  const rows = readFileSync(manifest, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => l.split('\t'))
  const byPair = new Map()
  for (const [id, vp, side, route, url, file, iso] of rows) {
    const key = `${id} ${vp}`
    const entry = byPair.get(key) ?? { id, vp, route }
    entry[side] = { file, url, iso }
    byPair.set(key, entry)
  }
  console.log(['id', 'viewport', 'box', 'differing', 'percent', 'heightDelta'].join('\t'))
  let total = 0
  for (const p of byPair.values()) {
    if (!p.a || !p.b) continue
    if (!existsSync(p.a.file) || !existsSync(p.b.file)) {
      console.error(`  skipped ${p.id}/${p.vp}: a capture file is gone`)
      continue
    }
    const out = join(outDir, `${p.id}.${p.vp}.diff.png`)
    const m = measure(p.a.file, p.b.file, out)
    total += m.differing
    console.log([p.id, p.vp, `${m.w}x${m.h}`, m.differing, m.percent.toFixed(2), m.heightDelta].join('\t'))
  }
  console.error(`total differing pixels: ${total}`)
} else {
  const [a, b, out] = argv
  const m = measure(a, b, out)
  console.log(
    [basename(a), `${m.w}x${m.h}`, m.differing, `${m.percent.toFixed(2)}%`, `height ${m.ah} then ${m.bh}`].join('\t'),
  )
}
