export const serializeAttentionTypes = (functionTypesImportPath: string) =>
  `import { pikkuAttentionFunc as corePikkuAttentionFunc } from '@pikku/core/attention-func'
import type { Services } from '${functionTypesImportPath}'

export type {
  AttentionScore,
  AttentionFuncInput,
} from '@pikku/core/attention-func'

/**
 * Declares what a widget needs attention for. Return nothing when all is fine,
 * or \`{ score: 0..1, verdict?, reason?, impact?, since? }\` when it is not.
 * Declare it in a \`*.attention.ts\` file; \`widget\` is a \`<screen>.<slot>\` of
 * this plugin's own arranged screens.
 *
 * @example snippet: attentionFunc
 */
export const pikkuAttentionFunc = (
  config: Parameters<typeof corePikkuAttentionFunc<Services>>[0]
) => corePikkuAttentionFunc<Services>(config)
`
