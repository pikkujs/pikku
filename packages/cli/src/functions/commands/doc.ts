import { pikkuSessionlessFunc } from '#pikku/function'
import { readShippedSurfaceDoc } from '../surface/shipped-surface-doc.js'
import {
  renderSurfaceDoc,
  UnknownSurfaceTargetError,
} from '../surface/render-surface-doc.js'
import type { SurfaceDoc } from '../surface/surface-doc.types.js'

/** One unknown name must not cost the agent the answers to the others in the same call. */
export const renderTopics = (
  surface: SurfaceDoc,
  topics: (string | undefined)[],
  options: { ai?: boolean; entryPoint: 'app' | 'addon' }
): string =>
  topics
    .map((target) => {
      try {
        return renderSurfaceDoc(surface, { ...options, target })
      } catch (error) {
        if (topics.length > 1 && error instanceof UnknownSurfaceTargetError) {
          return error.message
        }
        throw error
      }
    })
    .join('\n\n')

export const doc = pikkuSessionlessFunc<
  { topics?: string[]; ai?: boolean; addon?: boolean },
  { text: string }
>({
  description:
    'Print the public API surface of the pikku version installed here: the doors you import from, what each exports, and how each export is called.',
  func: async (_services, { topics, ai, addon }) => {
    const surface = readShippedSurfaceDoc()
    if (!surface) {
      throw new Error(
        'This @pikku/cli has no surface doc. It ships with the published package and is written when the CLI is built, so a source checkout needs a build first.'
      )
    }
    const targets = topics?.length ? topics : [undefined]
    return {
      text: renderTopics(surface, targets, {
        ai,
        entryPoint: addon ? 'addon' : 'app',
      }),
    }
  },
})

export const renderDoc = (
  _services: unknown,
  { text }: { text: string }
): void => {
  console.log(text)
}
