import { CorePikkuRouteHandler } from './core-pikku-route-handler.js'

/**
 * The `CorePikkuWebsocket` class provides a utility for managing websocket connections,
 * handling routes, and managing subscriptions. This class is designed to simplify
 * WebSocket wires with configurable options.
 */
export class CorePikkuWebsocket {
  private routes = new Map<string, CorePikkuRouteHandler>()
  private subscriptions = new Set<(data: unknown) => void>()
  private binarySubscriptions = new Set<(data: ArrayBuffer) => void>()

  /**
   * Constructs a new instance of the `CorePikkuWebsocket` class.
   *
   * @param ws - An instantiated WebSocket instance
   *
   * @example
   * // Browser usage
   * const ws = new WebSocket('ws://localhost:3000')
   * const pikkuWS = new CorePikkuWebsocket(ws)
   *
   * @example
   * // Node.js usage with 'ws' package
   * import WebSocket from 'ws'
   * const ws = new WebSocket('ws://localhost:3000')
   * const pikkuWS = new CorePikkuWebsocket(ws)
   */
  constructor(protected ws: WebSocket) {
    ws.binaryType = 'arraybuffer'
    ws.onmessage = this.handleMessage.bind(this)
  }

  public getRoute(route: string | symbol | number): CorePikkuRouteHandler {
    const route2 = route.toString()
    let routeHandler = this.routes.get(route2)
    if (!routeHandler) {
      routeHandler = new CorePikkuRouteHandler(
        route2,
        this.ws.send.bind(this.ws)
      )
      this.routes.set(route2, routeHandler)
    }
    return routeHandler
  }

  public send(data: unknown) {
    this.ws.send(JSON.stringify(data))
  }

  public sendBinary(data: ArrayBuffer | Uint8Array) {
    this.ws.send(data)
  }

  public onBinaryMessage(callback: (data: ArrayBuffer) => void) {
    this.binarySubscriptions.add(callback)
  }

  public offBinaryMessage(callback?: (data: ArrayBuffer) => void) {
    if (callback) {
      this.binarySubscriptions.delete(callback)
    } else {
      this.binarySubscriptions.clear()
    }
  }

  public onmessage: ((this: WebSocket, ev: MessageEvent) => any) | null = null

  public subscribe(callback: (data: any) => void) {
    this.subscriptions.add(callback)
  }

  public unsubscribe(callback?: (data: any) => void) {
    if (callback) {
      this.subscriptions.delete(callback)
    } else {
      this.subscriptions.clear()
    }
  }

  private handleMessage(event: MessageEvent) {
    if (!event.data) {
      // This occurs because aws seems to be returning
      // a message with no data
      return
    }

    if (event.data instanceof ArrayBuffer) {
      this.binarySubscriptions.forEach((cb) => cb(event.data as ArrayBuffer))
      if (this.onmessage) {
        this.onmessage.call(this.ws, event)
      }
      return
    }

    let parsed = false

    try {
      if (typeof event.data === 'string') {
        const json = JSON.parse(event.data)
        parsed = true
        for (const [type, routeHandler] of this.routes) {
          const route = json[type]
          if (route) {
            routeHandler._handleMessage(json[type], json)
          }
        }
        this.subscriptions.forEach((subscription) => subscription(json))
      }
    } catch {
      // Error parsing means we'll just bubble it to the normal onmessage handler
    }

    if (!parsed) {
      this.subscriptions.forEach((subscription) => subscription(event.data))
    }

    if (this.onmessage) {
      this.onmessage.call(this.ws, event)
    }
  }
}
