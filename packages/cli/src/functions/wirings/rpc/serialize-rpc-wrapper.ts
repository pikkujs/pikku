export const serializeRPCWrapper = (
  rpcMapPath: string,
  globalHTTPPrefix: string = ''
) => {
  return `
import { PikkuFetch } from "./pikku-fetch.gen.js"
import type { RPCInvoke, AgentName, TypedAgentRun, TypedAgentApprove, TypedStartWorkflow, TypedRunWorkflow, TypedWorkflowStatus } from '${rpcMapPath}'
import type { WorkflowRunStatus } from '@pikku/core/workflow'
import type { AgentInput } from '@pikku/core/agent'
import type { PikkuAgentEvent, PikkuAgentStreamOptions } from '@pikku/fetch'

/**
 * Streams one agent turn. Iterate it with \`for await\`: \`TEXT_MESSAGE_CONTENT\` events carry
 * the reply as \`delta\`s, a \`CUSTOM\` event named \`pikku:approval-request\` asks for an
 * approval, and \`RUN_FINISHED\` is the last event. A \`RUN_ERROR\` from the server throws a
 * \`PikkuAgentStreamError\`; leaving the loop early or aborting \`options.signal\` ends the request.
 */
export type TypedAgentClientStream = <Name extends AgentName>(
    name: Name,
    input: AgentInput,
    options?: PikkuAgentStreamOptions
) => AsyncGenerator<PikkuAgentEvent, void, undefined>

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
    invoke = ((rpcName: string, data?: unknown) => {
       return this.pikkuFetch.post(\`${globalHTTPPrefix}/rpc/\${String(rpcName)}\` as never, { rpcName: String(rpcName), data }) as any
    }) as RPCInvoke

    /**
     * Starts a workflow by name with the given input.
     * Posts to \\\`/workflow/:workflowName/start\\\`.
     *
     * @param workflowName - The registered workflow name
     * @param input - The workflow input data
     * @returns A promise that resolves with the new run ID
     */
    startWorkflow: TypedStartWorkflow = async (workflowName, input) => {
        return await this.pikkuFetch.post(\`${globalHTTPPrefix}/workflow/\${String(workflowName)}/start\` as never, { data: input }) as any
    }

    /**
     * Runs a workflow to completion and returns the output.
     * Posts to \\\`/workflow/:workflowName/run\\\`.
     *
     * @param workflowName - The registered workflow name
     * @param input - The workflow input data
     * @returns A promise that resolves with the workflow output
     */
    runWorkflow: TypedRunWorkflow = async (workflowName, input) => {
        return await this.pikkuFetch.post(\`${globalHTTPPrefix}/workflow/\${String(workflowName)}/run\` as never, { data: input }) as any
    }

    /**
     * Gets the current status of a workflow run.
     * GET \\\`/workflow/:workflowName/status/:runId\\\`.
     *
     * @param workflowName - The registered workflow name
     * @param runId - The workflow run ID
     * @returns A promise with the minimal run status
     */
    workflowStatus: TypedWorkflowStatus = async (workflowName, runId) => {
        return await this.pikkuFetch.get(\`${globalHTTPPrefix}/workflow/\${String(workflowName)}/status/\${runId}\` as never) as unknown as WorkflowRunStatus
    }

    /**
     * Agent namespace — methods for running, streaming, and approving AI agents.
     * All methods post to \\\`/rpc/agent/:agentName/*\\\`.
     */
    agent = {
        /**
         * Runs an agent to completion and returns the result.
         *
         * @param agentName - The registered agent name
         * @param input - The agent input (message, threadId, resourceId)
         * @returns A promise with runId, result, and token usage
         */
        run: ((agentName: string, input: AgentInput) => {
            return this.pikkuFetch.post(\`${globalHTTPPrefix}/rpc/agent/\${String(agentName)}\` as never, input as never)
        }) as TypedAgentRun,
        /**
         * Streams an agent turn as AG-UI events over SSE. Used for real-time chat interfaces.
         *
         * @param agentName - The registered agent name
         * @param input - The agent input (message, threadId, resourceId)
         * @param options - Pass \`signal\` to abort the stream
         * @returns An async iterable of the run's events, ending with \`RUN_FINISHED\`
         */
        stream: ((agentName: string, input: AgentInput, options?: PikkuAgentStreamOptions) => {
            return this.pikkuFetch.agentStream(\`${globalHTTPPrefix}/rpc/agent/\${String(agentName)}/stream\`, input, options)
        }) as TypedAgentClientStream,
        /**
         * Approves or denies the pending tool calls of a suspended run, and resumes it
         * to completion. Resolves to the same shape as \`run\`.
         *
         * @param agentName - The registered agent name
         * @param input - The approval payload (runId, approvals array)
         */
        approve: ((agentName: string, input: { runId: string; approvals: { toolCallId: string; approved: boolean }[] }) => {
            return this.pikkuFetch.post(\`${globalHTTPPrefix}/rpc/agent/\${String(agentName)}/approve\` as never, input as never)
        }) as TypedAgentApprove,
    }

    subscribeToSSE<T = unknown>(
        path: string,
        handler: (event: T) => void,
        onError?: (err: unknown) => void
    ): { close: () => void } {
        return this.pikkuFetch.subscribeToSSE(path, handler, onError)
    }
}

export const pikkuRPC = new PikkuRPC();
`
}
