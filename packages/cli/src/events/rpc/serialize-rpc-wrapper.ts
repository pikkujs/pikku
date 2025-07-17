export const serializeRPCWrapper = (rpcMapPath: string) => {
  return `
import { PikkuFetch } from "./pikku-fetch.gen.js"
import type { RPCInvoke } from '${rpcMapPath}'

export class PikkuRPC {
    pikkuFetch = new PikkuFetch()

    setPikkuFetch(pikkuFetch: PikkuFetch): void {
        this.pikkuFetch = pikkuFetch
    }

    setServerUrl(serverUrl: string): void {
        this.pikkuFetch.setServerUrl(serverUrl)
    }

    setAuthorizationJWT(jwt: string | null): void {
        this.pikkuFetch.setAuthorizationJWT(jwt)
    }

    // Generic RPC invoke method
    invoke: RPCInvoke = async (name, data) => {
       return await this.pikkuFetch.post('/rpc', { name, data })
    }
}

export const pikkuRPC = new PikkuRPC();
`
}
