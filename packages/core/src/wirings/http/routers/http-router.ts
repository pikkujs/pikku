import type { HTTPMethod } from '../http.types.js'
import { PathToRegexRouter } from './path-to-regex.js'

export type MatchResult = {
  route: string
  params: Record<string, any>
} | null

export interface Router {
  match(method: HTTPMethod, path: string): MatchResult
}

export const httpRouter = new PathToRegexRouter()
