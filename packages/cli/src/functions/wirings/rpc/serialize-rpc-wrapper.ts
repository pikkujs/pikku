export const serializeRPCWrapper = (rpcMapPath: string) => {
  return `
import { PikkuFetch } from "./pikku-fetch.gen.js"
import type { RPCInvoke, TypedAgentRun, TypedStartWorkflow } from '${rpcMapPath}'

/**
 * PikkuRPC provides a type-safe client for making Remote Procedure Calls (RPC)
 * to your Pikku server. It wraps the underlying HTTP client and provides a
 * simple interface for invoking server-side functions.
 */
export class PikkuRPC {
    /** The underlying HTTP client used for making RPC calls */
    pikkuFetch = new PikkuFetch()

    /**
     * Sets a custom PikkuFetch instance to use for RPC calls.
     * This allows you to configure custom settings or use a shared client instance.
     *
     * @param pikkuFetch - The PikkuFetch instance to use
     */
    setPikkuFetch(pikkuFetch: PikkuFetch): void {
        this.pikkuFetch = pikkuFetch
    }

    /**
     * Sets the base server URL for all RPC calls.
     *
     * @param serverUrl - The base URL of your Pikku server (e.g., 'https://api.example.com')
     */
    setServerUrl(serverUrl: string): void {
        this.pikkuFetch.setServerUrl(serverUrl)
    }

    /**
     * Sets the JWT token for authorization on all RPC calls.
     *
     * @param jwt - The JWT token to use for authorization, or null to remove authorization
     */
    setAuthorizationJWT(jwt: string | null): void {
        this.pikkuFetch.setAuthorizationJWT(jwt)
    }

    /**
     * Sets the API key for authorization on all RPC calls.
     *
     * @param apiKey - The API key to use for authorization, or null to remove the API key
     */
    setAPIKey(apiKey: string | null): void {
        this.pikkuFetch.setAPIKey(apiKey)
    }

    /**
     * Invokes a remote procedure call on the server.
     * This is a generic method that routes to the appropriate server function
     * based on the function name and passes the provided data.
     *
     * @param rpcName - The name of the server function to invoke
     * @param data - The data to pass to the server function
     * @returns A promise that resolves with the function's return value
     */
    invoke: RPCInvoke = async (rpcName, data) => {
       return await this.pikkuFetch.post(\`/rpc/\${String(rpcName)}\` as never, { rpcName: String(rpcName), data }) as any
    }

    startWorkflow: TypedStartWorkflow = async (workflowName, input) => {
        return await this.pikkuFetch.post(\`/rpc/workflow/\${String(workflowName)}\` as never, { workflowName: String(workflowName), input }) as any
    }

    agent = {
        run: (async (agentName, input) => {
            return await this.pikkuFetch.post(\`/rpc/agent/\${String(agentName)}\` as never, input) as any
        }) as TypedAgentRun,
    }
}

export const pikkuRPC = new PikkuRPC();
`
}
