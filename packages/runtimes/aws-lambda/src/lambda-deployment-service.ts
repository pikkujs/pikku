/**
 * Lambda deployment service — routes remote() calls via Lambda Invoke.
 *
 * When a gateway (agent, MCP, channel, workflow orchestrator) calls
 * remote('funcName'), this service dispatches to the function's Lambda
 * via the AWS SDK InvokeCommand. Equivalent to Cloudflare's service bindings.
 *
 * Session propagation uses the existing pikkuRemoteAuthMiddleware:
 * JWT signed with PIKKU_REMOTE_SECRET, session encrypted in payload.
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import type { DeploymentService, DeploymentConfig } from '@pikku/core/services'
import type { JWTService } from '@pikku/core/services'
import type { SecretService } from '@pikku/core/services'
import { encryptJSON } from '@pikku/core/crypto-utils'

export class LambdaDeploymentService implements DeploymentService {
  private client: LambdaClient
  private bindings: Map<string, string>

  constructor(
    private jwt: JWTService | undefined,
    private secrets: SecretService,
    functionBindings: Record<string, string>
  ) {
    this.client = new LambdaClient({})
    this.bindings = new Map(Object.entries(functionBindings))
  }

  async init(): Promise<void> {}
  async start(_config: DeploymentConfig): Promise<void> {}
  async stop(): Promise<void> {}

  async invoke(
    funcName: string,
    data: unknown,
    session?: unknown,
    traceId?: string
  ): Promise<unknown> {
    const lambdaFunctionName = this.bindings.get(funcName)
    if (!lambdaFunctionName) {
      throw new Error(
        `No Lambda binding for function '${funcName}'. ` +
          `Available bindings: ${[...this.bindings.keys()].join(', ')}`
      )
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(traceId && { 'x-request-id': traceId }),
    }

    // Sign session as JWT for pikkuRemoteAuthMiddleware
    let secret: string | undefined
    try {
      secret = await this.secrets.getSecret('PIKKU_REMOTE_SECRET')
    } catch {}

    if (secret && this.jwt) {
      const sessionEnc = session
        ? await encryptJSON(secret, { session })
        : undefined
      const token = await this.jwt.encode(
        { value: 5, unit: 'minute' },
        {
          aud: 'pikku-remote',
          fn: funcName,
          iat: Math.floor(Date.now() / 1000),
          session: sessionEnc,
        }
      )
      headers.authorization = `Bearer ${token}`
    }

    // Build a synthetic API Gateway event for the target Lambda
    const rpcPath = `/remote/rpc/${encodeURIComponent(funcName)}`
    const apiGatewayEvent = {
      httpMethod: 'POST',
      path: rpcPath,
      headers,
      body: JSON.stringify({ data }),
      isBase64Encoded: false,
      queryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      requestContext: {
        httpMethod: 'POST',
        path: rpcPath,
        stage: 'prod',
        requestId: crypto.randomUUID(),
        identity: {},
      },
      resource: rpcPath,
    }

    const response = await this.client.send(
      new InvokeCommand({
        FunctionName: lambdaFunctionName,
        Payload: JSON.stringify(apiGatewayEvent),
      })
    )

    if (response.FunctionError) {
      const errorPayload = response.Payload
        ? new TextDecoder().decode(response.Payload)
        : 'Unknown error'
      throw new Error(
        `Remote RPC call to '${funcName}' failed: Lambda error: ${errorPayload}`
      )
    }

    if (!response.Payload) {
      throw new Error(`Remote RPC call to '${funcName}' returned no payload`)
    }

    // The Lambda returns an API Gateway response shape
    const lambdaResult = JSON.parse(new TextDecoder().decode(response.Payload))

    if (lambdaResult.statusCode && lambdaResult.statusCode >= 400) {
      throw new Error(
        `Remote RPC call to '${funcName}' failed: ${lambdaResult.statusCode} ${lambdaResult.body}`
      )
    }

    // Parse the body from the API Gateway response
    const body = lambdaResult.body
    try {
      return JSON.parse(body)
    } catch {
      return body
    }
  }
}
