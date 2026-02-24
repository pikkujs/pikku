import { compile } from 'path-to-regexp'

import { CoreConfig, CoreSingletonServices, CreateConfig } from '@pikku/core'
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
  private singletonServices: CoreSingletonServices | undefined
  private singletonServicesPromise: Promise<CoreSingletonServices> | undefined

  /**
   * Constructs a new instance of the `PikkuNextJS` class.
   *
   * @param createConfig - A function that creates/gets the config used in pikku for the application.
   * @param createSingletonServices - A function that creates singleton services for the application.
   */
  constructor(
    private readonly createConfig: CreateConfig<CoreConfig> | undefined,
    private readonly createSingletonServices: (
      config: CoreConfig
    ) => Promise<CoreSingletonServices>
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
    await this.getSingletonServices()
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
    await this.getSingletonServices()
    const request = new PikkuActionNextRequest(
      injectIntoUrl(route as string, data),
      method as HTTPMethod,
      data,
      false
    )
    const response = new PikkuActionNextResponse(false)
    return (await fetchData<In, Out>(request, response, {
      skipUserSession: true,
      bubbleErrors: true,
    })) as Out
  }

  /**
   * Handles an API request from Next.js App Router route handler.
   *
   * @param req - The request object (NextRequest or any Request-compatible object).
   * @returns A promise that resolves to a Response object.
   */
  public async apiRequest(req: Request): Promise<Response> {
    await this.getSingletonServices()
    return fetch(req)
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

    if (!this.singletonServicesPromise) {
      this.singletonServicesPromise = (async () => {
        const config = this.createConfig
          ? await this.createConfig()
          : ({} as CoreConfig)
        const singletonServices = await this.createSingletonServices(config)
        this.singletonServices = singletonServices
        return singletonServices
      })().catch((error) => {
        this.singletonServicesPromise = undefined
        throw error
      })
    }

    return this.singletonServicesPromise
  }
}
