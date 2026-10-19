import { rpc } from './rpc'

export type GetSessionOutput = Awaited<ReturnType<typeof fetchSession>>

export function fetchSession() {
  return rpc().invoke('getSession', {})
}
