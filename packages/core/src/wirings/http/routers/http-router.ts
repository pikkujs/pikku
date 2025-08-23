import { CorePikkuMiddleware } from '../../../types/core.types.js'
import { HTTPMethod } from '../http.types.js'
import { PathToRegexRouter } from './path-to-regex.js'

export type MatchResult = {
  route: string
  params: Record<string, any>
  middleware?: CorePikkuMiddleware[]
} | null

export interface Router {
  match(method: HTTPMethod, path: string): MatchResult
}

export const httpRouter = new PathToRegexRouter()
