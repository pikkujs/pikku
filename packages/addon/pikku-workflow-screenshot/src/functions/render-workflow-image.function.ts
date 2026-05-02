import { Readable } from 'stream'
import { pikkuSessionlessFunc } from '#pikku'

export interface RenderWorkflowImageInput {
  workflowData: any
  bucket?: string
  key?: string
  width?: number
  height?: number
  format?: 'png' | 'jpeg'
}

export interface RenderWorkflowImageOutput {
  bucket: string
  key: string
  assetKey: string
  url?: string
}

const DEFAULT_BUCKET = 'workflow-screenshots'

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
    { workflowData, bucket, key, width, height, format }
  ) => {
    const imageBuffer = await screenshotService.renderWorkflowImage(
      workflowData,
      { width, height, format }
    )

    const resolvedFormat = format || 'png'
    const resolvedBucket = bucket || DEFAULT_BUCKET
    const resolvedKey = key || `${Date.now()}.${resolvedFormat}`

    const stream = Readable.from(imageBuffer)
    await content.writeFile({
      bucket: resolvedBucket,
      key: resolvedKey,
      stream,
    })
    const assetKey = `${resolvedBucket}/${resolvedKey}`

    let url: string | undefined
    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      url = await content.signContentKey({
        bucket: resolvedBucket,
        contentKey: resolvedKey,
        dateLessThan: expiresAt,
      })
    } catch {
      logger?.debug(
        'Content service does not support signing, returning asset key only'
      )
    }

    return {
      bucket: resolvedBucket,
      key: resolvedKey,
      assetKey,
      url,
    }
  },
})
