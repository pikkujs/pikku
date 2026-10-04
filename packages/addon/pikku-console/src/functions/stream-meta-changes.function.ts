import { watch } from 'node:fs'
import { pikkuFunc } from '#pikku/addon/function'

export const streamMetaChanges = pikkuFunc<null, any>({
  title: 'Stream Meta Changes',
  description:
    "SSE stream that sends { pikkuMeta: 'changed' } whenever the project's generated pikku meta is regenerated, so the console can refetch getAllMeta and redraw.",
  expose: false,
  scopes: ['pikku:console:wirings:read'],
  func: async ({ metaService }, _input, { channel }) => {
    const dir = metaService.basePath
    if (!channel || !dir) return

    let timer: ReturnType<typeof setTimeout> | undefined
    const watcher = watch(dir, { recursive: true }, (_event, file) => {
      if (file && !String(file).endsWith('.json')) return
      clearTimeout(timer)
      timer = setTimeout(() => channel.send({ pikkuMeta: 'changed' }), 300)
    })

    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (channel.state !== 'closed') return
        clearInterval(check)
        resolve()
      }, 1000)
    })
    clearTimeout(timer)
    watcher.close()
  },
})
