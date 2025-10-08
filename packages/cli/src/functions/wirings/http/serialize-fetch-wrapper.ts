export const serializeFetchWrapper = (routesMapPath: string) => {
  return `
import { CorePikkuFetch, HTTPMethod } from '@pikku/fetch'
import type { HTTPWiringsMap, HTTPWiringHandlerOf, HTTPWiringsWithMethod } from '${routesMapPath}'

export class PikkuFetch extends CorePikkuFetch {
    public async post<Route extends HTTPWiringsWithMethod<'POST'>>(
        route: Route,
        ...args: null extends HTTPWiringHandlerOf<Route, 'POST'>['input']
            ? [data?: Exclude<HTTPWiringHandlerOf<Route, 'POST'>['input'], null>, options?: Omit<RequestInit, 'body'>]
            : [data: HTTPWiringHandlerOf<Route, 'POST'>['input'], options?: Omit<RequestInit, 'body'>]
    ): Promise<HTTPWiringHandlerOf<Route, 'POST'>['output']> {
        const [data, options] = args;
        return super.api(route, 'POST', data, options);
    }

    public async get<Route extends HTTPWiringsWithMethod<'GET'>>(
        route: Route,
        ...args: null extends HTTPWiringHandlerOf<Route, 'GET'>['input']
            ? [data?: Exclude<HTTPWiringHandlerOf<Route, 'GET'>['input'], null>, options?: Omit<RequestInit, 'body'>]
            : [data: HTTPWiringHandlerOf<Route, 'GET'>['input'], options?: Omit<RequestInit, 'body'>]
    ): Promise<HTTPWiringHandlerOf<Route, 'GET'>['output']> {
        const [data, options] = args;
        return super.api(route, 'GET', data, options);
    }

    public async patch<Route extends HTTPWiringsWithMethod<'PATCH'>>(
        route: Route,
        ...args: null extends HTTPWiringHandlerOf<Route, 'PATCH'>['input']
            ? [data?: Exclude<HTTPWiringHandlerOf<Route, 'PATCH'>['input'], null>, options?: Omit<RequestInit, 'body'>]
            : [data: HTTPWiringHandlerOf<Route, 'PATCH'>['input'], options?: Omit<RequestInit, 'body'>]
    ): Promise<HTTPWiringHandlerOf<Route, 'PATCH'>['output']> {
        const [data, options] = args;
        return super.api(route, 'PATCH', data, options);
    }

    public async head<Route extends HTTPWiringsWithMethod<'HEAD'>>(
        route: Route,
        ...args: null extends HTTPWiringHandlerOf<Route, 'HEAD'>['input']
            ? [data?: Exclude<HTTPWiringHandlerOf<Route, 'HEAD'>['input'], null>, options?: Omit<RequestInit, 'body'>]
            : [data: HTTPWiringHandlerOf<Route, 'HEAD'>['input'], options?: Omit<RequestInit, 'body'>]
    ): Promise<HTTPWiringHandlerOf<Route, 'HEAD'>['output']> {
        const [data, options] = args;
        return super.api(route, 'HEAD', data, options);
    }

    public async delete<Route extends HTTPWiringsWithMethod<'DELETE'>>(
        route: Route,
        ...args: null extends HTTPWiringHandlerOf<Route, 'DELETE'>['input']
            ? [data?: Exclude<HTTPWiringHandlerOf<Route, 'DELETE'>['input'], null>, options?: Omit<RequestInit, 'body'>]
            : [data: HTTPWiringHandlerOf<Route, 'DELETE'>['input'], options?: Omit<RequestInit, 'body'>]
    ): Promise<HTTPWiringHandlerOf<Route, 'DELETE'>['output']> {
        const [data, options] = args;
        return super.api(route, 'DELETE', data, options);
    }

    public async fetch<
        Route extends keyof HTTPWiringsMap,
        Method extends keyof HTTPWiringsMap[Route]
    >(route: Route, method: Method, data: HTTPWiringHandlerOf<Route, Method>['input'], options?: Omit<RequestInit, 'body'>): Promise<Response> {
        return await super.fetch(route, method as HTTPMethod, data, options);
    }
}

export const pikkuFetch = new PikkuFetch();
`
}
