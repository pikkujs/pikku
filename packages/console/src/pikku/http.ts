import { PikkuFetch } from './pikku-fetch.gen.js'
import { PikkuRPC } from './pikku-rpc.gen.js'

export const toWebsocketUrl = (serverUrl: string): string => {
  const wsBase = serverUrl
    .replace(/^https:\/\//, 'wss://')
    .replace(/^http:\/\//, 'ws://')
  return `${wsBase}/ws/console`
}

export const isConsoleRpcName = (rpcName: string): boolean => {
  return rpcName.startsWith('console:') || rpcName.startsWith('pikkuConsole')
}

const invokeConsoleRpc = (
  serverUrl: string,
  rpcName: string
): Promise<unknown> => {
  return new Promise((resolve, reject) => {
    const wsUrl = toWebsocketUrl(serverUrl)
    const action = rpcName.startsWith('console:')
      ? rpcName.slice('console:'.length)
      : rpcName
    const ws = new WebSocket(wsUrl)
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error(`Console RPC "${action}" timed out`))
    }, 30_000)
    const cleanup = () => clearTimeout(timeout)
    ws.addEventListener(
      'open',
      () => {
        ws.send(JSON.stringify({ action }))
      },
      { once: true }
    )
    ws.addEventListener(
      'message',
      (event) => {
        cleanup()
        try {
          const parsed = JSON.parse(event.data as string)
          const { action: _, ...result } = parsed as Record<string, unknown>
          ws.close()
          resolve(result)
        } catch {
          ws.close()
          reject(new Error(`Console RPC "${action}" returned invalid JSON`))
        }
      },
      { once: true }
    )
    ws.addEventListener(
      'error',
      (event) => {
        cleanup()
        reject(event)
      },
      { once: true }
    )
  })
}

export const pikku = (options: {
  serverUrl: string
  credentials?: RequestCredentials
}) => {
  const fetch = new PikkuFetch()
  fetch.setServerUrl(options.serverUrl)
  const rpc = new PikkuRPC()
  rpc.setPikkuFetch(fetch)
  const originalInvoke = rpc.invoke.bind(rpc)
  rpc.invoke = ((rpcName: string, data?: unknown) => {
    if (isConsoleRpcName(String(rpcName))) {
      return invokeConsoleRpc(options.serverUrl, String(rpcName))
    }
    return (
      originalInvoke as (name: string, data?: unknown) => Promise<unknown>
    )(rpcName, data)
  }) as typeof rpc.invoke
  return { fetch, rpc }
}
