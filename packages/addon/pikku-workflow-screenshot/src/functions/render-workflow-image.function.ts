import { Readable } from 'stream'
import { pikkuSessionlessFunc } from '#pikku'

export interface RenderWorkflowImageInput {
  workflowData: any
  assetKey?: string
  width?: number
  height?: number
  format?: 'png' | 'jpeg'
}

export interface RenderWorkflowImageOutput {
  assetKey: string
  url?: string
}

export const renderWorkflowImage = pikkuSessionlessFunc<
  RenderWorkflowImageInput,
  RenderWorkflowImageOutput
>({
  title: 'Render Workflow Image',
  description:
    'Renders a workflow diagram as an image using a headless browser and returns the stored asset key.',
  expose: true,
  auth: false,
  func: async (
    { screenshotService, content, logger },
    { workflowData, assetKey, width, height, format }
  ) => {
    const imageBuffer = await screenshotService.renderWorkflowImage(
      workflowData,
      { width, height, format }
    )

    const resolvedFormat = format || 'png'
    const resolvedAssetKey =
      assetKey || `workflow-screenshots/${Date.now()}.${resolvedFormat}`

    const stream = Readable.from(imageBuffer)
    await content.writeFile(resolvedAssetKey, stream)

    let url: string | undefined
    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      url = await content.signContentKey(resolvedAssetKey, expiresAt)
    } catch {
      logger?.debug(
        'Content service does not support signing, returning asset key only'
      )
    }

    return { assetKey: resolvedAssetKey, url }
  },
})
