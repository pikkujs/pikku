import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'
import { toWebRequest } from '@pikku/core/http'

const STUDIO_HEADER = 'x-pikku-studio'

export const ProjectProxyInput = z.looseObject({ key: z.string() })

export const projectProxy = pikkuSessionlessFunc({
  description: "Pass a request through to a running project's own server.",
  input: ProjectProxyInput,
  func: async ({ studio }, { key }, { http }) => {
    const running = studio.projects.runningProject(key)
    if (!running) return Response.json({ error: 'That project is not open' }, { status: 404 })
    const incoming = toWebRequest(http!.request!, `http://127.0.0.1:${running.port}`)
    const url = new URL(incoming.url)
    url.pathname = url.pathname.slice(`/p/${key}`.length) || '/'
    const headers = new Headers(incoming.headers)
    headers.set('host', `127.0.0.1:${running.port}`)
    headers.set(STUDIO_HEADER, running.token)
    try {
      return await fetch(url, {
        method: incoming.method,
        headers,
        body: incoming.body,
        redirect: 'manual',
        // @ts-ignore
        duplex: 'half',
      })
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 502 })
    }
  },
})

export const ProjectShotInput = z.object({ key: z.string(), path: z.array(z.string()) })

export const projectShot = pikkuSessionlessFunc({
  description: 'A screenshot the builder took of a project page.',
  input: ProjectShotInput,
  func: async ({ studio }, { key, path }) => {
    const root = join(await studio.projects.projectDir(key), '.pikku', 'builder', 'looks')
    const file = normalize(join(root, ...path.slice(path[0] === '.pikku' ? 3 : 0)))
    if (!file.startsWith(root + sep) || extname(file) !== '.png' || !existsSync(file)) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    return new Response(await readFile(file), {
      headers: { 'content-type': 'image/png', 'cache-control': 'no-cache' },
    })
  },
})
