import { compile } from 'path-to-regexp'
import { EventEmitter } from 'eventemitter3'
import { NextRequest } from 'next/server.js'

import {
  CoreConfig,
  CoreSingletonServices,
  CreateConfig,
  CreateWireServices,
} from '@pikku/core'
import { HTTPMethod, fetchData, fetch } from '@pikku/core/http'
import { PikkuActionNextRequest } from './pikku-action-next-request.js'
import { PikkuActionNextResponse } from './pikku-action-next-response.js'

const injectIntoUrl = (route: string, keys: Record<string, string>) => {
  const path = compile(route)
  return path(keys)
}

/**
 * The `PikkuNextJS` class provides methods to interact with the Pikku framework in a Next.js environment,
 * including support for SSR requests, API requests, and action requests.
 */
export class PikkuNextJS {
  private readyEmitter = new EventEmitter()
  private singletonServices: CoreSingletonServices | undefined

  /**
   * Constructs a new instance of the `PikkuNextJS` class.
   *
   * @param createConfig - A function that creates/gets the config used in pikku for the application.
   * @param createSingletonServices - A function that creates singleton services for the application.
   * @param createWireServices - A function that creates session-specific services for each request.
   */
  constructor(
    private readonly createConfig: CreateConfig<CoreConfig>,
    private readonly createSingletonServices: (
      config: CoreConfig
    ) => Promise<CoreSingletonServices>,
    private readonly createWireServices: CreateWireServices<any, any, any>
  ) {}

  /**
   * Handles an action request, routing it to the appropriate handler.
   *
   * @param route - The route to handle.
   * @param method - The HTTP method for the request.
   * @param data - The data to be sent with the request.
   * @returns A promise that resolves to the response data.
   */
  public async actionRequest<In extends Record<string, any>, Out>(
    route: unknown,
    method: unknown,
    data: In
  ): Promise<Out> {
    const singletonServices = await this.getSingletonServices()
    const request = new PikkuActionNextRequest(
      injectIntoUrl(route as string, data),
      method as HTTPMethod,
      data,
      true
    )
    await request.init()

    const response = new PikkuActionNextResponse(true)
    await response.init()

    return (await fetchData<In, Out>(request, response, {
      singletonServices,
      createWireServices: this.createWireServices,
      bubbleErrors: true,
    })) as Out
  }

  /**
   * Handles a static action request, routing it to the appropriate handler with user session skipping.
   *
   * @param route - The route to handle.
   * @param method - The HTTP method for the request.
   * @param data - The data to be sent with the request.
   * @returns A promise that resolves to the response data.
   */
  public async staticActionRequest<In extends Record<string, any>, Out>(
    route: unknown,
    method: unknown,
    data: In
  ): Promise<Out> {
    const singletonServices = await this.getSingletonServices()
    const request = new PikkuActionNextRequest(
      injectIntoUrl(route as string, data),
      method as HTTPMethod,
      data,
      false
    )
    const response = new PikkuActionNextResponse(false)
    return (await fetchData<In, Out>(request, response, {
      singletonServices,
      createWireServices: this.createWireServices,
      skipUserSession: true,
      bubbleErrors: true,
    })) as Out
  }

  /**
   * Handles an RPC request with dynamic context (including user session).
   *
   * @param name - The RPC function name to invoke.
   * @param data - The data to be sent with the RPC request.
   * @returns A promise that resolves to the RPC response data.
   */
  public async rpc<Out>(name: string, data: any): Promise<Out> {
    const singletonServices = await this.getSingletonServices()
    const request = new PikkuActionNextRequest(
      '/rpc',
      'post' as HTTPMethod,
      { name, data },
      true
    )
    await request.init()

    const response = new PikkuActionNextResponse(true)
    await response.init()

    return (await fetchData<any, Out>(request, response, {
      singletonServices,
      createWireServices: this.createWireServices,
      bubbleErrors: true,
    })) as Out
  }

  /**
   * Handles a static RPC request without user session.
   *
   * @param name - The RPC function name to invoke.
   * @param data - The data to be sent with the RPC request.
   * @returns A promise that resolves to the RPC response data.
   */
  public async rpcStatic<Out>(name: string, data: any): Promise<Out> {
    const singletonServices = await this.getSingletonServices()
    const request = new PikkuActionNextRequest(
      '/rpc',
      'post' as HTTPMethod,
      { name, data },
      false
    )
    const response = new PikkuActionNextResponse(false)
    return (await fetchData<any, Out>(request, response, {
      singletonServices,
      createWireServices: this.createWireServices,
      skipUserSession: true,
      bubbleErrors: true,
    })) as Out
  }

  /**
   * Handles an API request from Next.js App Router route handler.
   *
   * @param req - The Next.js request object.
   * @returns A promise that resolves to a Next.js Response object.
   */
  public async apiRequest(req: NextRequest): Promise<Response> {
    const singletonServices = await this.getSingletonServices()
    return fetch(req, {
      singletonServices,
      createWireServices: this.createWireServices,
    })
  }

  /**
   * Retrieves the singleton services, ensuring they are only created once.
   *
   * @returns A promise that resolves to the singleton services.
   */
  private async getSingletonServices(): Promise<CoreSingletonServices> {
    if (this.singletonServices) {
      return this.singletonServices
    }

    if (this.readyEmitter.listenerCount('ready') === 0) {
      const config = await this.createConfig()
      this.createSingletonServices(config).then((singletonServices) => {
        this.singletonServices = singletonServices
        this.readyEmitter.emit('ready')
      })
    }

    return new Promise((resolve) => {
      this.readyEmitter.once('ready', async () => {
        resolve(this.singletonServices as CoreSingletonServices)
      })
    })
  }
}
