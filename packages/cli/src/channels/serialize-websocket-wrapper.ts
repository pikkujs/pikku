export const serializeWebsocketWrapper = (channelsMapPath: string) => {
  return `import { CorePikkuWebsocket, CorePikkuRouteHandler } from '@pikku/websocket'
import { ChannelDefaultHandlerOf, ChannelRouteHandlerOf, ChannelsMap } from '${channelsMapPath}';

class PikkuWebSocketRoute<Channel extends keyof ChannelsMap, Route extends keyof ChannelsMap[Channel]['routes']> extends CorePikkuRouteHandler {
    public subscribe<
        Method extends keyof ChannelsMap[Channel]['routes'][Route],
        Data extends ChannelRouteHandlerOf<Channel, Route, Method>['output']
    >(method: Method, callback: (data: Data) => void
    ) {
        super.subscribe(method.toString(), callback)
    }

    public unsubscribe<
        Method extends keyof ChannelsMap[Channel]['routes'][Route],
        Data extends ChannelRouteHandlerOf<Channel, Route, Method>['output']
    >(method: Method, callback?: (data: Data) => void) {
        super.unsubscribe(method.toString(), callback)
    }

    public send<
        Method extends keyof ChannelsMap[Channel]['routes'][Route],
        Data extends ChannelRouteHandlerOf<Channel, Route, Method>['input']
    >(method: Method, data: Data) {
        super.send(method.toString(), data)
    }
}

export class PikkuWebSocket<Channel extends keyof ChannelsMap> extends CorePikkuWebsocket {
    /**
     * Send a message to a specific route and method.
     * Validates the input data type.
     */
    public getRoute<Route extends keyof ChannelsMap[Channel]['routes']>(route: Route): PikkuWebSocketRoute<Channel, Route> {
        return super.getRoute(route)
    }

    /**
     * Subscribe to a specific route and method.
     */
    public subscribe<Data extends ChannelDefaultHandlerOf<Channel>['output']>(
        callback: (data: Data) => void
    ) {
        super.subscribe(callback)
    }

    /**
     * Subscribe to a specific route and method.
     */
    public unsubscribe<Data extends ChannelDefaultHandlerOf<Channel>['output']>(
        callback?: (data: Data) => void
    ) {
        super.unsubscribe(callback)
    }

    public send(data: ChannelDefaultHandlerOf<Channel>['input']) {
        super.send(data)
    }
}
  `
}
