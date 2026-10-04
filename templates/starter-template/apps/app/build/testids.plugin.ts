import * as babel from '@babel/core'
import type { Plugin } from 'vite'
import injectTestIds from './inject-testids'

const JSX_FILE = /\.[jt]sx$/

/**
 * Run the testid stamper over the app's JSX.
 *
 * A standalone pre-transform rather than a `babel` option on `@vitejs/plugin-react`, which
 * mirrors how `apps/console` runs its `data-om` plugin and for the same reason:
 * plugin-react@6 is the rolldown/oxc build and has NO babel option, so a transform hung off
 * that option stops running on the version bump — silently, since the app still builds and
 * only the scenarios notice. Owning the babel pass costs one extra parse of the app's own
 * source in exchange for surviving that.
 *
 * NOT `apply: 'serve'`: scenarios drive the built sandbox app as well as the dev server, so
 * a dev-only stamp would leave every deployed app unaddressable.
 *
 * The source anchors ride along on the same parse, but only when fabric asks
 * for them — they put the app's file layout in view-source, and the panel that
 * reads them is gated on the same flag.
 */
export function testIds(): Plugin {
  const sourceAnchors = process.env.FABRIC_CHANGES_PANEL === 'true'
  return {
    name: 'pikku:testids',
    enforce: 'pre',
    async transform(code, id) {
      const file = id.split('?')[0]
      if (!file || !JSX_FILE.test(file) || file.includes('/node_modules/')) return null

      const result = await babel.transformAsync(code, {
        filename: file,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        parserOpts: { plugins: ['jsx', 'typescript'] },
        plugins: [[injectTestIds, { sourceAnchors }]],
      })
      if (!result?.code) return null
      return { code: result.code, map: result.map }
    },
  }
}
