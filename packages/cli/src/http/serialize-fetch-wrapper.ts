export const serializeFetchWrapper = (routesMapPath: string) => {
  return `
import { CorePikkuFetch, HTTPMethod } from '@pikku/fetch'
import type { RoutesMap, RouteHandlerOf, RoutesWithMethod } from '${routesMapPath}'

export class PikkuFetch extends CorePikkuFetch {
    public async post<Route extends RoutesWithMethod<'POST'>>(
        route: Route,
        data: RouteHandlerOf<Route, 'POST'>['input'] = null,
        options?: Omit<RequestInit, 'body'>
    ): Promise<RouteHandlerOf<Route, 'POST'>['output']> {
        return super.api(route, 'POST', data, options);
    }

    public async get<Route extends RoutesWithMethod<'GET'>>(
        route: Route,
        data: RouteHandlerOf<Route, 'GET'>['input'] = null,
        options?: Omit<RequestInit, 'body'>
    ): Promise<RouteHandlerOf<Route, 'GET'>['output']> {
        return super.api(route, 'GET', data, options);
    }

    public async patch<Route extends RoutesWithMethod<'PATCH'>>(
        route: Route,
        data: RouteHandlerOf<Route, 'PATCH'>['input'] = null,
        options?: Omit<RequestInit, 'body'>
    ): Promise<RouteHandlerOf<Route, 'PATCH'>['output']> {
        return super.api(route, 'PATCH', data, options);
    }

    public async head<Route extends RoutesWithMethod<'HEAD'>>(
        route: Route,
        data: RouteHandlerOf<Route, 'HEAD'>['input'] = null,
        options?: Omit<RequestInit, 'body'>
    ): Promise<RouteHandlerOf<Route, 'HEAD'>['output']> {
        return super.api(route, 'HEAD', data, options);
    }

    public async delete<Route extends RoutesWithMethod<'DELETE'>>(
        route: Route,
        data: RouteHandlerOf<Route, 'DELETE'>['input'] = null,
        options?: Omit<RequestInit, 'body'>
    ): Promise<RouteHandlerOf<Route, 'DELETE'>['output']> {
        return super.api(route, 'DELETE', data, options);
    }

    public async fetch<
        Route extends keyof RoutesMap,
        Method extends keyof RoutesMap[Route]
    >(route: Route, method: Method, data: RouteHandlerOf<Route, Method>['input'], options?: Omit<RequestInit, 'body'>): Promise<Response> {
        return await super.fetch(route, method as HTTPMethod, data, options)
    }
}

export const pikkuFetch = new PikkuFetch()
`
}
