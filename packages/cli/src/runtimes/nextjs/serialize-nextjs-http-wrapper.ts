export const serializeNextJsHTTPWrapper = (
  routesMapPath: string,
  pikkuFetchImport: string,
  rpcImport: string
) => {
  return `'server-only'
  
/**
 * This file provides a wrapper around the PikkuNextJS class to allow for methods to be type checked against your routes.
 * It ensures type safety for route handling methods when integrating with the @pikku/core framework.
 */
import { CorePikkuFetchOptions } from '@pikku/fetch'
import type { RoutesMap, RouteHandlerOf, RoutesWithMethod } from '${routesMapPath}'
import { PikkuFetch } from '${pikkuFetchImport}'
import type { RPCInvoke } from '${rpcImport}'

let _pikku: PikkuFetch | undefined

/**
 * Initializes and returns an instance of PikkuNextJS with helper methods for handling route requests.
 *
 * @returns An object containing methods for making dynamic and static action requests, as well as session retrieval.
 */
export const pikku = (options?: CorePikkuFetchOptions) => {
  if (!_pikku) {
    _pikku = new PikkuFetch(options)
  }

  const dynamicActionRequest = async <
    Route extends keyof RoutesMap,
    Method extends keyof RoutesMap[Route]
  >(
    route: Route,
    method: Method,
    data: RouteHandlerOf<Route, Method>['input'] = null
  ): Promise<RouteHandlerOf<Route, Method>['output']> => {
    return (_pikku! as any)[(method as string).toLowerCase()](route, data as any)
  }

  /**
   * Makes a static action request for a specified route and method.
   * Static requests do not depend on headers or cookies and are suitable for precompile stages.
   *
   * @template Route - The route key from the RoutesMap.
   * @template Method - The method key from the specified route.
   * @param route - The route identifier.
   * @param method - The HTTP method to be used for the request.
   * @param data - The input data for the request, defaults to null.
   * @returns A promise that resolves to the output of the route handler.
   */
  const staticActionRequest = async <
    Route extends keyof RoutesMap,
    Method extends keyof RoutesMap[Route]
  >(
    route: Route,
    method: Method,
    data: RouteHandlerOf<Route, Method>['input'] = null
  ): Promise<RouteHandlerOf<Route, Method>['output']> => {
    return (_pikku! as any)[(method as string).toLowerCase()](route, data as any)
  }

  /**
   * Makes a dynamic POST request for a specified route.
   *
   * @template Route - The route key with the POST method.
   * @param route - The route identifier.
   * @param data - The input data for the POST request, defaults to null.
   * @returns A promise that resolves to the output of the POST handler.
   */
  const dynamicPost = <Route extends RoutesWithMethod<'POST'>>(
    route: Route,
    data: RouteHandlerOf<Route, 'POST'>['input'] = null
  ): Promise<RouteHandlerOf<Route, 'POST'>['output']> => {
    return dynamicActionRequest(route, 'POST', data)
  }

  /**
   * Makes a dynamic GET request for a specified route.
   *
   * @template Route - The route key with the GET method.
   * @param route - The route identifier.
   * @param data - The input data for the GET request, defaults to null.
   * @returns A promise that resolves to the output of the GET handler.
   */
  const dynamicGet = <Route extends RoutesWithMethod<'GET'>>(
    route: Route,
    data: RouteHandlerOf<Route, 'GET'>['input'] = null
  ): Promise<RouteHandlerOf<Route, 'GET'>['output']> => {
    return dynamicActionRequest(route, 'GET', data)
  }

  /**
   * Makes a dynamic PATCH request for a specified route.
   *
   * @template Route - The route key with the PATCH method.
   * @param route - The route identifier.
   * @param data - The input data for the PATCH request, defaults to null.
   * @returns A promise that resolves to the output of the PATCH handler.
   */
  const dynamicPatch = <Route extends RoutesWithMethod<'PATCH'>>(
    route: Route,
    data: RouteHandlerOf<Route, 'PATCH'>['input'] = null
  ): Promise<RouteHandlerOf<Route, 'PATCH'>['output']> => {
    return dynamicActionRequest(route, 'PATCH', data)
  }

  /**
   * Makes a dynamic DELETE request for a specified route.
   *
   * @template Route - The route key with the DELETE method.
   * @param route - The route identifier.
   * @param data - The input data for the DELETE request, defaults to null.
   * @returns A promise that resolves to the output of the DELETE handler.
   */
  const dynamicDel = <Route extends RoutesWithMethod<'DELETE'>>(
    route: Route,
    data: RouteHandlerOf<Route, 'DELETE'>['input'] = null
  ): Promise<RouteHandlerOf<Route, 'DELETE'>['output']> => {
    return dynamicActionRequest(route, 'DELETE', data)
  }

  // Static Requests

  /**
   * Makes a static POST request for a specified route.
   *
   * @template Route - The route key with the POST method.
   * @param route - The route identifier.
   * @param data - The input data for the POST request, defaults to null.
   * @returns A promise that resolves to the output of the POST handler.
   */
  const staticPost = <Route extends RoutesWithMethod<'POST'>>(
    route: Route,
    data: RouteHandlerOf<Route, 'POST'>['input'] = null
  ): Promise<RouteHandlerOf<Route, 'POST'>['output']> => {
    return staticActionRequest(route, 'POST', data)
  }

  /**
   * Makes a static GET request for a specified route.
   *
   * @template Route - The route key with the GET method.
   * @param route - The route identifier.
   * @param data - The input data for the GET request, defaults to null.
   * @returns A promise that resolves to the output of the GET handler.
   */
  const staticGet = <Route extends RoutesWithMethod<'GET'>>(
    route: Route,
    data: RouteHandlerOf<Route, 'GET'>['input'] = null
  ): Promise<RouteHandlerOf<Route, 'GET'>['output']> => {
    return staticActionRequest(route, 'GET', data)
  }

  /**
   * Makes an RPC call using the dynamic fetch instance.
   * RPC calls are made as POST requests to the /rpc endpoint.
   *
   * @param name - The RPC method name.
   * @param data - The input data for the RPC call.
   * @returns A promise that resolves to the output of the RPC handler.
   */
  const rpc: RPCInvoke = async (name, data) => {
    return (_pikku! as any).post('/rpc', { name, data })
  }

  /**
   * Makes a static RPC call using the dynamic fetch instance.
   * Static RPC calls are made as POST requests to the /rpc endpoint.
   *
   * @param name - The RPC method name.
   * @param data - The input data for the RPC call.
   * @returns A promise that resolves to the output of the RPC handler.
   */
  const staticRPC: RPCInvoke = async (name, data) => {
    return (_pikku! as any).post('/rpc', { name, data })
  }

  return {
    get: dynamicGet,
    post: dynamicPost,
    patch: dynamicPatch,
    del: dynamicDel,
    staticGet,
    staticPost,
    rpc,
    staticRPC
  }
}
`
}
