import type { HTTPMethod } from '../http.types.js'
import { PathToRegexRouter } from './path-to-regex.js'

export type MatchResult = {
  route: string
  params: Record<string, any>
} | null

export interface Router {
  match(method: HTTPMethod, path: string): MatchResult
}

/**
 * The router that matches a method and path against the wired HTTP routes and
 * channels. It compiles the routes on first match, so a route wired after that
 * is not seen until `reset()` is called; tests and hot reload call `reset()`
 * after rewiring.
 */
export const httpRouter = new PathToRegexRouter()
