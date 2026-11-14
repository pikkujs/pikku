import { createServer } from 'node:http'

/**
 * A loopback OTLP sink for the telemetry bench. It reads each POST in full and discards it, so the app pays for a real HTTP
 * round trip and the sink does not store anything. Run it as its own process (pinned to its own core) so it does not take the
 * app's CPU.
 *
 *   --port N          listen port (default 0: print the one chosen)
 *   --mode ok|status:CODE|stall:MS|slow:MS   what to answer; switchable at runtime with POST /__mode/<mode>
 *   --decode          count spans/logs/metrics received (costs sink CPU; for the correctness run only)
 *
 * GET /__stats returns what was received.
 */
const arg = (name: string, fallback: string) => {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? fallback : (process.argv[at + 1] ?? fallback)
}

let mode = arg('mode', 'ok')
const decode = process.argv.includes('--decode')
const received = {
  posts: { traces: 0, logs: 0, metrics: 0 } as Record<string, number>,
  bytes: { traces: 0, logs: 0, metrics: 0 } as Record<string, number>,
  items: { traces: 0, logs: 0, metrics: 0 } as Record<string, number>,
  inFlight: 0,
  maxInFlight: 0,
}

/** Counts the repeated `spans`/`logRecords` entries of a request without a full protobuf decode (one level of length-delimited walking). */
const countItems = (body: Buffer): number => {
  const readVarint = (buf: Buffer, at: number): [number, number] => {
    let result = 0
    let shift = 0
    for (;;) {
      const byte = buf[at++]!
      result += (byte & 0x7f) * 2 ** shift
      if (!(byte & 0x80)) return [result, at]
      shift += 7
    }
  }
  const fieldsOf = (buf: Buffer, start: number, end: number) => {
    const out: { field: number; from: number; to: number }[] = []
    let at = start
    while (at < end) {
      const [tag, next] = readVarint(buf, at)
      at = next
      const wire = tag & 7
      if (wire === 2) {
        const [len, after] = readVarint(buf, at)
        out.push({ field: tag >> 3, from: after, to: after + len })
        at = after + len
      } else if (wire === 0) at = readVarint(buf, at)[1]
      else if (wire === 1) at += 8
      else if (wire === 5) at += 4
      else break
    }
    return out
  }
  // resource(1) -> scope(2) -> item(2): the same shape for spans, log records and metrics
  let count = 0
  for (const resource of fieldsOf(body, 0, body.length).filter(
    (f) => f.field === 1
  )) {
    for (const scope of fieldsOf(body, resource.from, resource.to).filter(
      (f) => f.field === 2
    )) {
      count += fieldsOf(body, scope.from, scope.to).filter(
        (f) => f.field === 2
      ).length
    }
  }
  return count
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/__stats') {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ mode, ...received }))
    return
  }
  if (req.method === 'POST' && req.url?.startsWith('/__mode/')) {
    mode = decodeURIComponent(req.url.slice('/__mode/'.length))
    res.end('ok')
    return
  }
  const signal = req.url?.split('/').pop() ?? 'unknown'
  received.inFlight++
  received.maxInFlight = Math.max(received.maxInFlight, received.inFlight)
  const chunks: Buffer[] = []
  req.on('data', (chunk: Buffer) => {
    received.bytes[signal] = (received.bytes[signal] ?? 0) + chunk.length
    if (decode) chunks.push(chunk)
  })
  req.on('close', () => {
    received.inFlight--
  })
  req.on('end', () => {
    received.posts[signal] = (received.posts[signal] ?? 0) + 1
    if (decode) {
      received.items[signal] =
        (received.items[signal] ?? 0) + countItems(Buffer.concat(chunks))
    }
    const [kind, value] = mode.split(':')
    const reply = (status: number) => {
      res.statusCode = status
      res.end()
    }
    if (kind === 'status') reply(Number(value))
    else if (kind === 'stall' || kind === 'slow') {
      if (value === 'forever') return
      setTimeout(() => reply(200), Number(value))
    } else reply(200)
  })
})

server.listen(Number(arg('port', '0')), '127.0.0.1', () => {
  const address = server.address()
  console.log(
    JSON.stringify({
      sinkPort: typeof address === 'object' && address ? address.port : 0,
    })
  )
})
process.on('SIGTERM', () => process.exit(0))
