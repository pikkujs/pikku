#!/usr/bin/env node
/** `relink-bin.js <dir> <cli-bin> <pikku-checkout>`: points <dir>'s @pikku/* at the local build, as the bun shim does after an install. */
import { relinkPikku } from './relink.js'

const [dir, bin, checkout] = process.argv.slice(2)
if (!dir || !bin || !checkout) {
  console.error('usage: relink-bin.js <dir> <cli-bin> <pikku-checkout>')
  process.exit(2)
}
relinkPikku(dir, { bin, checkout })
