export const serializeNextJsBackendWrapper = (
  bootstrapPath: string,
  routesMapPath: string,
  configImport: string,
  singleServicesFactoryImport: string,
  sessionServicesImport: string
) => {
  return `'server-only'

/**
 * This file provides a wrapper around the PikkuNextJS class to allow for methods to be type checked against your routes.
 * It ensures type safety for route handling methods when integrating with the @pikku/core framework.
 */
import { PikkuNextJS } from '@pikku/next'
import { NextRequest } from 'next/server.js'
import type { HTTPWiringsMap, HTTPWiringHandlerOf, HTTPWiringsWithMethod, RPCMap } from '${routesMapPath}'

type RouteContext = { params: Promise<Record<string, string | string[]>> }

${configImport}
${singleServicesFactoryImport}
${sessionServicesImport}

import '${bootstrapPath}'

let _pikku: PikkuNextJS | undefined
let _removeAPIPrefix = true

export const removeAPIPrefix = (enable: boolean) => {
  _removeAPIPrefix = enable
}

/**
 * Initializes and returns an instance of PikkuNextJS with helper methods for handling route requests.
 *
 * @returns An object containing methods for making dynamic and static action requests, as well as session retrieval.
 */
export const pikku = (_options?: any) => {
  if (!_pikku) {
    _pikku = new PikkuNextJS(
      createConfig as any,
      createSingletonServices as any,
      createSessionServices
    )
  }

  /**
   * Makes a dynamic action request for a specified route and method.
   * Dynamic requests may access headers and cookies and are therefore unsuitable for precompile stages.
   *
   * @template Route - The route key from the HTTPWiringsMap.
   * @template Method - The method key from the specified route.
   * @param route - The route identifier.
   * @param method - The HTTP method to be used for the request.
   * @param data - The input data for the request, defaults to null.
   * @returns A promise that resolves to the output of the route handler.
   */
  const dynamicActionRequest = async <
    Route extends keyof HTTPWiringsMap,
    Method extends keyof HTTPWiringsMap[Route]
  >(
    route: Route,
    method: Method,
    data: HTTPWiringHandlerOf<Route, Method>['input'] = null
  ): Promise<HTTPWiringHandlerOf<Route, Method>['output']> => {
    return _pikku!.actionRequest(route, method, data as any)
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
    return _pikku!.staticActionRequest(route, method, data as any)
  }

  /**
   * Makes a dynamic POST request for a specified route.
   *
   * @template Route - The route key with the POST method.
   * @param route - The route identifier.
   * @param data - The input data for the POST request, defaults to null.
   * @returns A promise that resolves to the output of the POST handler.
   */
  const dynamicPost = <Route extends HTTPWiringsWithMethod<'POST'>>(
    route: Route,
    data: HTTPWiringHandlerOf<Route, 'POST'>['input'] = null
  ): Promise<HTTPWiringHandlerOf<Route, 'POST'>['output']> => {
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
  const dynamicGet = <Route extends HTTPWiringsWithMethod<'GET'>>(
    route: Route,
    data: HTTPWiringHandlerOf<Route, 'GET'>['input'] = null
  ): Promise<HTTPWiringHandlerOf<Route, 'GET'>['output']> => {
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
  const dynamicPatch = <Route extends HTTPWiringsWithMethod<'PATCH'>>(
    route: Route,
    data: HTTPWiringHandlerOf<Route, 'PATCH'>['input'] = null
  ): Promise<HTTPWiringHandlerOf<Route, 'PATCH'>['output']> => {
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
  const dynamicDel = <Route extends HTTPWiringsWithMethod<'DELETE'>>(
    route: Route,
    data: HTTPWiringHandlerOf<Route, 'DELETE'>['input'] = null
  ): Promise<HTTPWiringHandlerOf<Route, 'DELETE'>['output']> => {
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
  const staticPost = <Route extends HTTPWiringsWithMethod<'POST'>>(
    route: Route,
    data: HTTPWiringHandlerOf<Route, 'POST'>['input'] = null
  ): Promise<HTTPWiringHandlerOf<Route, 'POST'>['output']> => {
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
  const staticGet = <Route extends HTTPWiringsWithMethod<'GET'>>(
    route: Route,
    data: HTTPWiringHandlerOf<Route, 'GET'>['input'] = null
  ): Promise<HTTPWiringHandlerOf<Route, 'GET'>['output']> => {
    return staticActionRequest(route, 'GET', data)
  }

  // RPC Requests

  /**
   * Type definition for RPC invocation with dynamic context.
   */
  type RPCInvoke = <Name extends keyof RPCMap>(
    name: Name,
    data: RPCMap[Name]['input']
  ) => Promise<RPCMap[Name]['output']>

  /**
   * Makes a dynamic RPC request.
   * Dynamic RPC requests may access headers and cookies.
   *
   * @template Name - The RPC function name from the RPCMap.
   * @param name - The RPC function identifier.
   * @param data - The input data for the RPC request.
   * @returns A promise that resolves to the output of the RPC handler.
   */
  const rpc: RPCInvoke = async (name, data) => {
    return await _pikku!.rpc(name as any, data) as any
  }

  /**
   * Makes a static RPC request without user session.
   * Static RPC requests do not depend on headers or cookies.
   *
   * @template Name - The RPC function name from the RPCMap.
   * @param name - The RPC function identifier.
   * @param data - The input data for the RPC request.
   * @returns A promise that resolves to the output of the RPC handler.
   */
  const rpcStatic: RPCInvoke = async (name, data) => {
    return await _pikku!.rpcStatic(name as any, data) as any
  }

  return {
    get: dynamicGet,
    post: dynamicPost,
    patch: dynamicPatch,
    del: dynamicDel,
    staticGet,
    staticPost,
    rpc,
    rpcStatic,
  }
}

/**
 * Pre-bound API request handler for Next.js App Router route handlers.
 * Use this to directly export route handlers without losing context.
 *
 * @param req - The Next.js request object.
 * @param context - Next.js route context (unused by Pikku, but required by Next.js signature).
 * @returns A promise that resolves to a Next.js Response object.
 *
 * @example
 * export const GET = pikkuAPIRequest
 * export const POST = pikkuAPIRequest
 */
export const pikkuAPIRequest = (
  req: NextRequest,
  context: RouteContext
): Promise<Response> => {
  if (!_pikku) {
    _pikku = new PikkuNextJS(
      createConfig as any,
      createSingletonServices as any,
      createSessionServices
    )
  }
  if (_removeAPIPrefix) {
    const url = new URL(req.url)
    url.pathname = url.pathname.replace(/^\\/api/, '') || '/'
    req = new NextRequest(url.toString(), {
      method: req.method,
      headers: req.headers,
      body: req.body,
      duplex: 'half',
    } as any)
  }
  return _pikku.apiRequest(req)
}
`
}
