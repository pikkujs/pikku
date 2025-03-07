/**
 * This file was generated by the @pikku/cli
 */

import { CorePikkuFetch, HTTPMethod } from '@pikku/fetch'
import type {
  RoutesMap,
  RouteHandlerOf,
  RoutesWithMethod,
} from './pikku-routes-map.gen.d.js'

export class PikkuFetch extends CorePikkuFetch {
  public async post<Route extends RoutesWithMethod<'POST'>>(
    route: Route,
    ...args: null extends RouteHandlerOf<Route, 'POST'>['input']
      ? [
          data?: Exclude<RouteHandlerOf<Route, 'POST'>['input'], null>,
          options?: Omit<RequestInit, 'body'>,
        ]
      : [
          data: RouteHandlerOf<Route, 'POST'>['input'],
          options?: Omit<RequestInit, 'body'>,
        ]
  ): Promise<RouteHandlerOf<Route, 'POST'>['output']> {
    const [data, options] = args
    return super.api(route, 'POST', data, options)
  }

  public async get<Route extends RoutesWithMethod<'GET'>>(
    route: Route,
    ...args: null extends RouteHandlerOf<Route, 'GET'>['input']
      ? [
          data?: Exclude<RouteHandlerOf<Route, 'GET'>['input'], null>,
          options?: Omit<RequestInit, 'body'>,
        ]
      : [
          data: RouteHandlerOf<Route, 'GET'>['input'],
          options?: Omit<RequestInit, 'body'>,
        ]
  ): Promise<RouteHandlerOf<Route, 'GET'>['output']> {
    const [data, options] = args
    return super.api(route, 'GET', data, options)
  }

  public async patch<Route extends RoutesWithMethod<'PATCH'>>(
    route: Route,
    ...args: null extends RouteHandlerOf<Route, 'PATCH'>['input']
      ? [
          data?: Exclude<RouteHandlerOf<Route, 'PATCH'>['input'], null>,
          options?: Omit<RequestInit, 'body'>,
        ]
      : [
          data: RouteHandlerOf<Route, 'PATCH'>['input'],
          options?: Omit<RequestInit, 'body'>,
        ]
  ): Promise<RouteHandlerOf<Route, 'PATCH'>['output']> {
    const [data, options] = args
    return super.api(route, 'PATCH', data, options)
  }

  public async head<Route extends RoutesWithMethod<'HEAD'>>(
    route: Route,
    ...args: null extends RouteHandlerOf<Route, 'HEAD'>['input']
      ? [
          data?: Exclude<RouteHandlerOf<Route, 'HEAD'>['input'], null>,
          options?: Omit<RequestInit, 'body'>,
        ]
      : [
          data: RouteHandlerOf<Route, 'HEAD'>['input'],
          options?: Omit<RequestInit, 'body'>,
        ]
  ): Promise<RouteHandlerOf<Route, 'HEAD'>['output']> {
    const [data, options] = args
    return super.api(route, 'HEAD', data, options)
  }

  public async delete<Route extends RoutesWithMethod<'DELETE'>>(
    route: Route,
    ...args: null extends RouteHandlerOf<Route, 'DELETE'>['input']
      ? [
          data?: Exclude<RouteHandlerOf<Route, 'DELETE'>['input'], null>,
          options?: Omit<RequestInit, 'body'>,
        ]
      : [
          data: RouteHandlerOf<Route, 'DELETE'>['input'],
          options?: Omit<RequestInit, 'body'>,
        ]
  ): Promise<RouteHandlerOf<Route, 'DELETE'>['output']> {
    const [data, options] = args
    return super.api(route, 'DELETE', data, options)
  }

  public async fetch<
    Route extends keyof RoutesMap,
    Method extends keyof RoutesMap[Route],
  >(
    route: Route,
    method: Method,
    data: RouteHandlerOf<Route, Method>['input'],
    options?: Omit<RequestInit, 'body'>
  ): Promise<Response> {
    return await super.fetch(route, method as HTTPMethod, data, options)
  }
}

export const pikkuFetch = new PikkuFetch()
