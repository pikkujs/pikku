/**
 * Synthesized `pikku-server-proxy` Worker.
 *
 * Emitted alongside the merged `pikku-server-container` unit when a project
 * has any `target: 'server'` functions. The proxy is a regular CF Worker
 * that fronts a Cloudflare Container — its DurableObject class binds to
 * the container app via `ctx.container`, and its default fetch handler
 * forwards every inbound request to the container DO.
 *
 * Output is plain ESM JS (no esbuild step). CF handles `cloudflare:workers`
 * natively, and the script has no other imports — there's nothing to
 * bundle. The orchestrator (fabric / wrangler) uploads the file as-is.
 *
 * This is generic CF-Containers wiring (a non-fabric pikku user deploying
 * to plain CF needs the same Worker), so it lives in the CF provider, not
 * in fabric. Account-level resources (the container app, image push,
 * dispatch namespace) are still the orchestrator's job.
 */

const SERVER_PROXY_UNIT_NAME = 'pikku-server-proxy'
const PIKKU_CONTAINER_BINDING = 'PIKKU_CONTAINER'
const PIKKU_CONTAINER_CLASS = 'PikkuContainer'
const CONTAINER_PORT = 8080

export const serverProxyConstants = {
  unitName: SERVER_PROXY_UNIT_NAME,
  binding: PIKKU_CONTAINER_BINDING,
  className: PIKKU_CONTAINER_CLASS,
  port: CONTAINER_PORT,
} as const

/** ESM JS source for the proxy Worker. Written directly to bundle.js. */
export function generateServerProxyBundle(): string {
  return `// Generated proxy worker for "${SERVER_PROXY_UNIT_NAME}"
// Forwards every inbound request to the bound CF Container via a Durable
// Object. The DO has \`ctx.container\` available because the container
// application is provisioned against this DO's namespace.
import { DurableObject } from 'cloudflare:workers'

const CONTAINER_PORT = ${CONTAINER_PORT}
const PORT_READY_MAX_TRIES = 90
const PORT_READY_INTERVAL_MS = 1000

export class ${PIKKU_CONTAINER_CLASS} extends DurableObject {
  async fetch(request) {
    const container = this.ctx.container
    if (!container) {
      return new Response('container binding missing on this DO', { status: 500 })
    }

    const port = container.getTcpPort(CONTAINER_PORT)

    // getTcpPort().fetch() rejects https URLs — the DO→container hop is
    // plaintext over a private socket. Rewrite to http and preserve path+query.
    const inUrl = new URL(request.url)
    const fwdUrl = 'http://container' + inUrl.pathname + inUrl.search

    let startErr = null
    let lastFetchErr = null
    for (let attempt = 0; attempt < PORT_READY_MAX_TRIES; attempt++) {
      if (!container.running) {
        try {
          await container.start()
          startErr = null
        } catch (e) {
          startErr = e
        }
      }
      try {
        return await port.fetch(new Request(fwdUrl, request.clone()))
      } catch (err) {
        lastFetchErr = err
        await new Promise((r) => setTimeout(r, PORT_READY_INTERVAL_MS))
      }
    }
    return new Response(
      JSON.stringify({
        msg: 'container did not become ready',
        running: container.running,
        startErr: startErr ? (startErr.message || String(startErr)) : null,
        lastFetchErr: lastFetchErr ? (lastFetchErr.message || String(lastFetchErr)) : null,
        attempts: PORT_READY_MAX_TRIES,
        totalWaitMs: PORT_READY_MAX_TRIES * PORT_READY_INTERVAL_MS,
      }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    )
  }
}

export default {
  async fetch(request, env) {
    const id = env.${PIKKU_CONTAINER_BINDING}.idFromName('default')
    return env.${PIKKU_CONTAINER_BINDING}.get(id).fetch(request)
  }
}
`
}
