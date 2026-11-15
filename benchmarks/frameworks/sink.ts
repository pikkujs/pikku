import { createServer } from 'node:http'
import { gunzipSync } from 'node:zlib'
import { decodeLogs, decodeMetrics } from '@pikku/core/testing'

/**
 * Recording OTLP/protobuf sink for the "what does each adapter emit" step. Decodes every POST (so it is only used for that step,
 * never during a measured window) and answers GET /__records with, per signal: posts, bytes, items, and a count per span name /
 * metric name / log body. Prints `{ sinkPort }` on start.
 */
const records = {
  traces: { posts: 0, bytes: 0, items: 0, names: {} as Record<string, number> },
  logs: { posts: 0, bytes: 0, items: 0, names: {} as Record<string, number> },
  metrics: {
    posts: 0,
    bytes: 0,
    items: 0,
    names: {} as Record<string, number>,
  },
}
/** Generic wire walk for spans (resource(1) > scope(2) > span(2) > name(5)); used when the typed decoder meets an attribute type it does not know (arrays). */
const walk = (buf: Uint8Array, start = 0, end = buf.length) => {
  const out: { field: number; from: number; to: number }[] = []
  let at = start
  const varint = () => {
    let result = 0
    let shift = 0
    for (;;) {
      const byte = buf[at++]!
      result += (byte & 0x7f) * 2 ** shift
      if (!(byte & 0x80)) return result
      shift += 7
    }
  }
  while (at < end) {
    const tag = varint()
    const wire = tag & 7
    if (wire === 2) {
      const len = varint()
      out.push({ field: tag >> 3, from: at, to: at + len })
      at += len
    } else if (wire === 0) varint()
    else if (wire === 1) at += 8
    else if (wire === 5) at += 4
    else break
  }
  return out
}
const spanNames = (buf: Uint8Array) => {
  const names: string[] = []
  for (const r of walk(buf).filter((f) => f.field === 1))
    for (const sc of walk(buf, r.from, r.to).filter((f) => f.field === 2))
      for (const sp of walk(buf, sc.from, sc.to).filter((f) => f.field === 2)) {
        const name = walk(buf, sp.from, sp.to).find((f) => f.field === 5)
        names.push(
          name
            ? new TextDecoder().decode(buf.slice(name.from, name.to))
            : '(unnamed)'
        )
      }
  return names
}
const bump = (map: Record<string, number>, key: string) =>
  (map[key] = (map[key] ?? 0) + 1)

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/__records') {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(records))
    return
  }
  const chunks: Buffer[] = []
  req.on('data', (c: Buffer) => chunks.push(c))
  req.on('end', () => {
    res.end()
    const signal = (req.url?.split('/').pop() ?? '') as keyof typeof records
    const target = records[signal]
    if (!target) return
    let body: Uint8Array = Buffer.concat(chunks)
    target.posts++
    target.bytes += body.length
    try {
      if (req.headers['content-encoding'] === 'gzip') body = gunzipSync(body)
      if (signal === 'traces') {
        const names = spanNames(body)
        target.items += names.length
        for (const name of names) bump(target.names, name)
      } else if (signal === 'logs') {
        const { items } = decodeLogs(body)
        target.items += items.length
        for (const l of items)
          bump(target.names, JSON.stringify(l.body).slice(0, 60))
      } else {
        const { items } = decodeMetrics(body)
        target.items += items.length
        for (const m of items) bump(target.names, m.name)
      }
    } catch (error) {
      bump(target.names, `(undecodable: ${(error as Error).message})`)
    }
  })
}).listen(0, '127.0.0.1', function (this: any) {
  console.log(JSON.stringify({ sinkPort: this.address().port }))
})
process.on('SIGTERM', () => process.exit(0))
