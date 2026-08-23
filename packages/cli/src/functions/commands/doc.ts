import { pikkuSessionlessFunc } from '#pikku/function'
import { readShippedSurfaceDoc } from '../surface/shipped-surface-doc.js'
import { renderSurfaceDoc } from '../surface/render-surface-doc.js'

export const doc = pikkuSessionlessFunc<
  { topic?: string; ai?: boolean; addon?: boolean },
  { text: string }
>({
  description:
    'Print the public API surface of the pikku version installed here: the doors you import from, what each exports, and how each export is called.',
  func: async (_services, { topic, ai, addon }) => {
    const surface = readShippedSurfaceDoc()
    if (!surface) {
      throw new Error(
        'This @pikku/cli has no surface doc. It ships with the published package and is written when the CLI is built, so a source checkout needs a build first.'
      )
    }
    return {
      text: renderSurfaceDoc(surface, {
        target: topic,
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
