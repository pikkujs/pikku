import { compile } from 'path-to-regexp'
import { EventEmitter } from 'eventemitter3'
import { PikkuActionNextRequest } from './pikku-action-next-request.js'
import { PikkuActionNextResponse } from './pikku-action-next-response.js'

import {
  CoreConfig,
  CoreSingletonServices,
  CoreUserSession,
  CreateConfig,
  CreateSessionServices,
  PikkuMiddleware,
} from '@pikku/core'
import { HTTPMethod, runHTTPRoute } from '@pikku/core/http'
import { runMiddleware, LocalUserSessionService } from '@pikku/core'
import { PikkuNextRequest } from './pikku-next-request.js'

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
   * @param createSessionServices - A function that creates session-specific services for each request.
   */
  constructor(
    private readonly createConfig: CreateConfig<CoreConfig>,
    private readonly createSingletonServices: (
      config: CoreConfig
    ) => Promise<CoreSingletonServices>,
    private readonly createSessionServices: CreateSessionServices<any, any, any>
  ) {}

  /**
   * Handles an action request, routing it to the appropriate handler.
   *
   * @param route - The route to handle.
   * @param method - The HTTP method for the request.
   * @param data - The data to be sent with the request.
   * @returns A promise that resolves to the response data.
   */
  public async getSession(
    request: PikkuNextRequest,
    middleware: PikkuMiddleware[]
  ): Promise<CoreUserSession | undefined> {
    const userSessionService = new LocalUserSessionService()
    const singletonServices = await this.getSingletonServices()
    await runMiddleware(
      { ...singletonServices, userSessionService },
      {
        http: { request: request as any },
      },
      middleware as any
    )
    return userSessionService.get()
  }

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
    const request = new PikkuActionNextRequest<In>(
      route as string,
      method as HTTPMethod,
      data,
      true
    )
    await request.init()
    const response = new PikkuActionNextResponse(true)
    await response.init()
    return (await runHTTPRoute<In, Out>({
      request,
      response,
      singletonServices,
      createSessionServices: this.createSessionServices,
      route: injectIntoUrl(route as string, data),
      method: method as HTTPMethod,
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
    return (await runHTTPRoute<In, Out>({
      request: new PikkuActionNextRequest(
        route as string,
        method as HTTPMethod,
        data,
        false
      ),
      response: new PikkuActionNextResponse(false),
      singletonServices,
      createSessionServices: this.createSessionServices,
      route: injectIntoUrl(route as string, data),
      method: method as HTTPMethod,
      skipUserSession: true,
      bubbleErrors: true,
    })) as Out
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
