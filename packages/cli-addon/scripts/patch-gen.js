#!/usr/bin/env node
/**
 * Post-codegen patches to generated .pikku files.
 *
 * These patches work around limitations in the published @pikku/cli that
 * are fixed in the upstream source but not yet released. Once @pikku/cli
 * is published with those fixes, the corresponding patches here become
 * no-ops and can be removed.
 */
import fs from 'node:fs'

const PATCHES = [
  {
    file: '.pikku/addon/pikku-package.gen.ts',
    when: (src) => !src.includes('@ts-expect-error'),
    apply: (src) =>
      src.replace(
        /(\n)(\s*)createSingletonServices,/,
        "$1$2// @ts-expect-error addon factories don't fit base PikkuPackageState factory types$1$2createSingletonServices,"
      ),
  },
]

for (const { file, when, apply } of PATCHES) {
  if (!fs.existsSync(file)) continue
  const src = fs.readFileSync(file, 'utf8')
  if (!when(src)) continue
  fs.writeFileSync(file, apply(src))
  console.log(`[patch-gen] patched ${file}`)
}
