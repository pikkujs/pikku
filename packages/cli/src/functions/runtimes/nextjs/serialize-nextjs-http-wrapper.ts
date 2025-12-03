export const serializeNextJsHTTPWrapper = (
  routesMapPath: string,
  rpcMapPath: string,
  pikkuFetchImport: string
) => {
  return `'server-only'
  
/**
 * This file provides a wrapper around the PikkuNextJS class to allow for methods to be type checked against your routes.
 * It ensures type safety for route handling methods when integrating with the @pikku/core framework.
 */
import { CorePikkuFetchOptions } from '@pikku/fetch'
import type { HTTPWiringsMap, HTTPWiringHandlerOf, HTTPWiringsWithMethod } from '${routesMapPath}'
import type { FlattenedRPCMap } from '${rpcMapPath}'
import { PikkuFetch } from '${pikkuFetchImport}'

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
    Route extends keyof HTTPWiringsMap,
    Method extends keyof HTTPWiringsMap[Route]
  >(
    route: Route,
    method: Method,
    data: HTTPWiringHandlerOf<Route, Method>['input'] = null
  ): Promise<HTTPWiringHandlerOf<Route, Method>['output']> => {
    return (_pikku! as any)[(method as string).toLowerCase()](route, data as any)
  }

  /**
   * Makes a static action request for a specified route and method.
   * Static requests do not depend on headers or cookies and are suitable for precompile stages.
   *
   * @template Route - The route key from the HTTPWiringsMap.
   * @template Method - The method key from the specified route.
   * @param route - The route identifier.
   * @param method - The HTTP method to be used for the request.
   * @param data - The input data for the request, defaults to null.
   * @returns A promise that resolves to the output of the route handler.
   */
  const staticActionRequest = async <
    Route extends keyof HTTPWiringsMap,
    Method extends keyof HTTPWiringsMap[Route]
  >(
    route: Route,
    method: Method,
    data: HTTPWiringHandlerOf<Route, Method>['input'] = null
  ): Promise<HTTPWiringHandlerOf<Route, Method>['output']> => {
    return (_pikku! as any)[(method as string).toLowerCase()](route, data as any)
  }

  /**
   * Makes a dynamic POST request for a specified route.
   *
   * @template Route - The route key with the POST method.
   * @param route - The route identifier.
   * @param data - The input data for the POST request (required if input type is defined).
   * @returns A promise that resolves to the output of the POST handler.
   */
  const dynamicPost = <Route extends HTTPWiringsWithMethod<'POST'>>(
    route: Route,
    ...args: HTTPWiringHandlerOf<Route, 'POST'>['input'] extends null | undefined
      ? [data?: HTTPWiringHandlerOf<Route, 'POST'>['input']]
      : [data: NonNullable<HTTPWiringHandlerOf<Route, 'POST'>['input']>]
  ): Promise<HTTPWiringHandlerOf<Route, 'POST'>['output']> => {
    return dynamicActionRequest(route, 'POST', args[0] ?? null)
  }

  /**
   * Makes a dynamic GET request for a specified route.
   *
   * @template Route - The route key with the GET method.
   * @param route - The route identifier.
   * @param data - The input data for the GET request (required if input type is defined).
   * @returns A promise that resolves to the output of the GET handler.
   */
  const dynamicGet = <Route extends HTTPWiringsWithMethod<'GET'>>(
    route: Route,
    ...args: HTTPWiringHandlerOf<Route, 'GET'>['input'] extends null | undefined
      ? [data?: HTTPWiringHandlerOf<Route, 'GET'>['input']]
      : [data: NonNullable<HTTPWiringHandlerOf<Route, 'GET'>['input']>]
  ): Promise<HTTPWiringHandlerOf<Route, 'GET'>['output']> => {
    return dynamicActionRequest(route, 'GET', args[0] ?? null)
  }

  /**
   * Makes a dynamic PATCH request for a specified route.
   *
   * @template Route - The route key with the PATCH method.
   * @param route - The route identifier.
   * @param data - The input data for the PATCH request (required if input type is defined).
   * @returns A promise that resolves to the output of the PATCH handler.
   */
  const dynamicPatch = <Route extends HTTPWiringsWithMethod<'PATCH'>>(
    route: Route,
    ...args: HTTPWiringHandlerOf<Route, 'PATCH'>['input'] extends null | undefined
      ? [data?: HTTPWiringHandlerOf<Route, 'PATCH'>['input']]
      : [data: NonNullable<HTTPWiringHandlerOf<Route, 'PATCH'>['input']>]
  ): Promise<HTTPWiringHandlerOf<Route, 'PATCH'>['output']> => {
    return dynamicActionRequest(route, 'PATCH', args[0] ?? null)
  }

  /**
   * Makes a dynamic DELETE request for a specified route.
   *
   * @template Route - The route key with the DELETE method.
   * @param route - The route identifier.
   * @param data - The input data for the DELETE request (required if input type is defined).
   * @returns A promise that resolves to the output of the DELETE handler.
   */
  const dynamicDel = <Route extends HTTPWiringsWithMethod<'DELETE'>>(
    route: Route,
    ...args: HTTPWiringHandlerOf<Route, 'DELETE'>['input'] extends null | undefined
      ? [data?: HTTPWiringHandlerOf<Route, 'DELETE'>['input']]
      : [data: NonNullable<HTTPWiringHandlerOf<Route, 'DELETE'>['input']>]
  ): Promise<HTTPWiringHandlerOf<Route, 'DELETE'>['output']> => {
    return dynamicActionRequest(route, 'DELETE', args[0] ?? null)
  }

  // Static Requests

  /**
   * Makes a static POST request for a specified route.
   *
   * @template Route - The route key with the POST method.
   * @param route - The route identifier.
   * @param data - The input data for the POST request (required if input type is defined).
   * @returns A promise that resolves to the output of the POST handler.
   */
  const staticPost = <Route extends HTTPWiringsWithMethod<'POST'>>(
    route: Route,
    ...args: HTTPWiringHandlerOf<Route, 'POST'>['input'] extends null | undefined
      ? [data?: HTTPWiringHandlerOf<Route, 'POST'>['input']]
      : [data: NonNullable<HTTPWiringHandlerOf<Route, 'POST'>['input']>]
  ): Promise<HTTPWiringHandlerOf<Route, 'POST'>['output']> => {
    return staticActionRequest(route, 'POST', args[0] ?? null)
  }

  /**
   * Makes a static GET request for a specified route.
   *
   * @template Route - The route key with the GET method.
   * @param route - The route identifier.
   * @param data - The input data for the GET request (required if input type is defined).
   * @returns A promise that resolves to the output of the GET handler.
   */
  const staticGet = <Route extends HTTPWiringsWithMethod<'GET'>>(
    route: Route,
    ...args: HTTPWiringHandlerOf<Route, 'GET'>['input'] extends null | undefined
      ? [data?: HTTPWiringHandlerOf<Route, 'GET'>['input']]
      : [data: NonNullable<HTTPWiringHandlerOf<Route, 'GET'>['input']>]
  ): Promise<HTTPWiringHandlerOf<Route, 'GET'>['output']> => {
    return staticActionRequest(route, 'GET', args[0] ?? null)
  }

  // RPC Requests

  /**
   * Makes a dynamic RPC request.
   *
   * @template Name - The RPC function name from the FlattenedRPCMap.
   * @param name - The RPC function identifier.
   * @param data - The input data for the RPC request (required if input type is defined).
   * @returns A promise that resolves to the output of the RPC handler.
   */
  const rpc = async <Name extends keyof FlattenedRPCMap>(
    rpcName: Name,
    ...args: FlattenedRPCMap[Name]['input'] extends null | undefined
      ? [data?: FlattenedRPCMap[Name]['input']]
      : [data: NonNullable<FlattenedRPCMap[Name]['input']>]
  ): Promise<FlattenedRPCMap[Name]['output']> => {
    return dynamicActionRequest('/rpc/:rpcName' as '/rpc/:rpcName', 'POST', { rpcName, data: args[0] ?? null }) as unknown as FlattenedRPCMap[Name]['output']
  }

  /**
   * Makes a static RPC request.
   * Note: In HTTP wrapper context, both rpc and rpcStatic behave the same way.
   *
   * @template Name - The RPC function name from the FlattenedRPCMap.
   * @param name - The RPC function identifier.
   * @param data - The input data for the RPC request (required if input type is defined).
   * @returns A promise that resolves to the output of the RPC handler.
   */
  const staticRPC = async <Name extends keyof FlattenedRPCMap>(
    rpcName: Name,
    ...args: FlattenedRPCMap[Name]['input'] extends null | undefined
      ? [data?: FlattenedRPCMap[Name]['input']]
      : [data: NonNullable<FlattenedRPCMap[Name]['input']>]
  ): Promise<FlattenedRPCMap[Name]['output']> => {
    return staticActionRequest('/rpc/:rpcName' as '/rpc/:rpcName', 'POST', { rpcName, data: args[0] ?? null }) as unknown as FlattenedRPCMap[Name]['output']
  }

  return {
    rpc,
    get: dynamicGet,
    post: dynamicPost,
    patch: dynamicPatch,
    del: dynamicDel,
    staticGet,
    staticPost,
    staticRPC
  }
}
`
}
