import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import type { IncomingMessage } from 'node:http'
import {
  shutdownManagedProcesses,
  startManagedProcess,
  type ManagedProcess,
} from './managed-processes.ts'

type RuntimeTarget = 'dev' | 'standalone' | 'serverless' | 'cloudflare'

type DeploymentHandler = {
  type: 'fetch' | 'queue' | 'scheduled'
  routes?: Array<{ method: string; route: string }>
}

type DeploymentUnit = {
  name: string
  handlers: DeploymentHandler[]
}

type DeploymentManifest = {
  units: DeploymentUnit[]
}

type RouteBinding = {
  method: string
  regex: RegExp
  port: number
}

const target = process.argv[2] as RuntimeTarget | undefined
const validTargets: RuntimeTarget[] = [
  'dev',
  'standalone',
  'serverless',
  'cloudflare',
]

if (!target || !validTargets.includes(target)) {
  console.error(`Usage: yarn test:runtime <${validTargets.join('|')}>`)
  process.exit(1)
}

const functionsDir = path.resolve(import.meta.dirname, '..')
const managedProcesses: ManagedProcess[] = []
const managedClosers: Array<() => Promise<void>> = []
const sharedRuntimeEnv = {
  AUTH_SECRET: 'pikku-test-auth-secret',
  PIKKU_REMOTE_SECRET: 'pikku-test-remote-secret',
}
const mcpPorts: Record<'dev' | 'standalone', number> = {
  dev: 4020,
  standalone: 4021,
}

const runtimeConfig: Record<RuntimeTarget, { port: number; baseUrl: string }> =
  {
    dev: { port: 4010, baseUrl: 'http://localhost:4010' },
    standalone: { port: 4011, baseUrl: 'http://127.0.0.1:4011' },
    serverless: { port: 4003, baseUrl: 'http://127.0.0.1:4003' },
    cloudflare: { port: 4012, baseUrl: 'http://127.0.0.1:4012' },
  }

async function main() {
  const { baseUrl } = runtimeConfig[target]
  const cleanup = () => void shutdownRuntimeResources()

  process.on('SIGINT', () => {
    cleanup()
    process.exit(130)
  })
  process.on('SIGTERM', () => {
    cleanup()
    process.exit(143)
  })
  process.on('exit', cleanup)

  resetDeployState()

  if (target === 'dev') {
    await runPikkuAll()
    startProcess(
      'dev',
      'yarn',
      [
        'run',
        'pikku',
        'dev',
        '--port',
        String(runtimeConfig.dev.port),
        '--watch',
        'false',
        '--hmr',
        'false',
      ],
      sharedRuntimeEnv
    )
  }

  if (target === 'standalone') {
    await runPikkuAll()
    await runPikkuDeployPlan('standalone')
    const bundlePath = path.resolve(
      functionsDir,
      '.deploy',
      'standalone',
      'templates-functions',
      'bundle.js'
    )
    startProcess('standalone', 'node', [bundlePath], {
      ...sharedRuntimeEnv,
      PORT: String(runtimeConfig.standalone.port),
      HOST: '127.0.0.1',
    })
  }

  if (target === 'serverless') {
    await runPikkuAll('serverless')
    await runPikkuDeployPlan('serverless')
    startProcess(
      'serverless',
      'yarn',
      [
        'exec',
        'serverless',
        'offline',
        '--config',
        '.deploy/serverless/serverless.yml',
        '--stage',
        'local',
        '--region',
        'us-east-1',
      ],
      {
        ...sharedRuntimeEnv,
        AWS_ACCESS_KEY_ID: 'local',
        AWS_SECRET_ACCESS_KEY: 'local',
        AWS_REGION: 'us-east-1',
        SERVERLESS_ACCESS_KEY: '',
        SLS_TELEMETRY_DISABLED: '1',
        SLS_NOTIFICATIONS_MODE: 'off',
      }
    )
  }

  if (target === 'cloudflare') {
    await runPikkuAll('serverless')
    await runPikkuDeployPlan('cloudflare')
    await startCloudflareProxy(runtimeConfig.cloudflare.port)
  }

  await runRuntimeTests(target, baseUrl)
  await shutdownRuntimeResources()
}

async function shutdownRuntimeResources() {
  while (managedClosers.length > 0) {
    const close = managedClosers.pop()
    if (!close) {
      continue
    }
    try {
      await close()
    } catch {}
  }
  await shutdownManagedProcesses(managedProcesses)
}

function resetDeployState() {
  rmSync(path.join(functionsDir, '.deploy'), { recursive: true, force: true })
  rmSync(path.join(functionsDir, 'src', 'scaffold'), {
    recursive: true,
    force: true,
  })
}

function startProcess(
  name: string,
  command: string,
  args: string[],
  extraEnv: Record<string, string> = {}
) {
  startManagedProcess(
    managedProcesses,
    name,
    command,
    args,
    functionsDir,
    extraEnv
  )
}

function runCommand(
  command: string,
  args: string[],
  extraEnv: Record<string, string> = {}
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: functionsDir,
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: 'inherit',
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} ${args.join(' ')} failed with code ${code}`))
    })
    child.on('error', reject)
  })
}

function runPikkuAll(targetName?: 'serverless') {
  const args = ['run', 'pikku', 'all']
  if (targetName) {
    args.push('--target', targetName)
  }
  return runCommand('yarn', args)
}

function runPikkuDeployPlan(
  provider: 'standalone' | 'serverless' | 'cloudflare'
) {
  return runCommand('yarn', [
    'run',
    'pikku',
    'deploy',
    'plan',
    '--provider',
    provider,
    '--result-file',
    `.deploy/${provider}/plan-result.json`,
  ])
}

function filterUpstreamResponseHeaders(headers: Headers) {
  const filteredHeaders = new Headers(headers)
  filteredHeaders.delete('content-encoding')
  filteredHeaders.delete('content-length')
  filteredHeaders.delete('transfer-encoding')
  return filteredHeaders
}

async function startCloudflareProxy(port: number) {
  const manifestPath = path.join(
    functionsDir,
    '.deploy',
    'cloudflare',
    'deployment-manifest.json'
  )
  const manifest = JSON.parse(
    await readFile(manifestPath, 'utf-8')
  ) as DeploymentManifest
  const requiredMatches = [
    { method: 'GET', path: '/todos' },
    { method: 'GET', path: '/todos/stream' },
    { method: 'POST', path: '/todos' },
    { method: 'POST', path: '/todos/example-id/complete' },
    { method: 'DELETE', path: '/todos/example-id' },
    { method: 'POST', path: '/rpc/greet' },
    { method: 'POST', path: '/rpc/ext:hello' },
    { method: 'POST', path: '/workflow/createAndNotifyWorkflow/start' },
    { method: 'POST', path: '/workflow/createAndNotifyWorkflow/run' },
    {
      method: 'GET',
      path: '/workflow/createAndNotifyWorkflow/status/example-run',
    },
  ]
  const selectedUnits = new Map<string, number>()
  const routeBindings: RouteBinding[] = []
  let nextPort = 8810

  for (const requiredMatch of requiredMatches) {
    const unit = manifest.units.find((candidate) =>
      candidate.handlers.some(
        (handler) =>
          handler.type === 'fetch' &&
          (handler.routes ?? []).some(
            (route) =>
              route.method.toUpperCase() === requiredMatch.method &&
              routeMatches(route.route, requiredMatch.path)
          )
      )
    )

    if (!unit) {
      throw new Error(
        `No Cloudflare unit found for ${requiredMatch.method} ${requiredMatch.path}`
      )
    }

    if (!selectedUnits.has(unit.name)) {
      const workerPort = nextPort
      const inspectorPort = 9230 + (workerPort - 8810)
      selectedUnits.set(unit.name, workerPort)
      startProcess('cf:' + unit.name, 'yarn', [
        'exec',
        'wrangler',
        'dev',
        '--config',
        `.deploy/cloudflare/units/${unit.name}/wrangler.toml`,
        '--local',
        '--port',
        String(workerPort),
        '--inspector-port',
        String(inspectorPort),
        '--ip',
        '127.0.0.1',
      ])
      nextPort += 1
    }
  }

  for (const unit of manifest.units) {
    const unitPort = selectedUnits.get(unit.name)
    if (!unitPort) {
      continue
    }

    for (const handler of unit.handlers) {
      if (handler.type !== 'fetch') {
        continue
      }

      for (const route of handler.routes ?? []) {
        routeBindings.push({
          method: route.method.toUpperCase(),
          regex: compileRouteRegex(route.route),
          port: unitPort,
        })
      }
    }
  }

  const server = createServer(async (request, response) => {
    try {
      const requestPath = request.url
        ? new URL(request.url, `http://127.0.0.1:${port}`).pathname
        : '/'
      const requestMethod = (request.method || 'GET').toUpperCase()
      const binding = routeBindings.find(
        (routeBinding) =>
          routeBinding.method === requestMethod &&
          routeBinding.regex.test(requestPath)
      )

      if (!binding) {
        response.statusCode = 404
        response.end(`No route for ${requestMethod} ${requestPath}`)
        return
      }

      const body = await readRequestBody(request)
      const upstreamUrl = new URL(
        request.url || '/',
        `http://127.0.0.1:${binding.port}`
      )
      const upstreamResponse = await fetch(upstreamUrl, {
        method: requestMethod,
        headers: filterHeaders(request.headers),
        body:
          requestMethod === 'GET' || requestMethod === 'HEAD'
            ? undefined
            : body,
      })

      response.statusCode = upstreamResponse.status
      const responseHeaders = filterUpstreamResponseHeaders(
        upstreamResponse.headers
      )
      responseHeaders.forEach((value, key) => {
        response.setHeader(key, value)
      })
      const upstreamBody = Buffer.from(await upstreamResponse.arrayBuffer())
      response.end(upstreamBody)
    } catch (error) {
      response.statusCode = 502
      response.end(error instanceof Error ? error.message : String(error))
    }
  })

  server.listen(port, '127.0.0.1')
  await once(server, 'listening')
  managedClosers.push(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  })
}

function routeMatches(route: string, requestPath: string) {
  return compileRouteRegex(route).test(requestPath)
}

function compileRouteRegex(route: string) {
  const pattern = route
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        return '[^/]+'
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('\\/')
  return new RegExp(`^${pattern}$`)
}

function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    request.on('end', () => {
      resolve(Buffer.concat(chunks))
    })
    request.on('error', reject)
  })
}

function filterHeaders(headers: NodeJS.Dict<string | string[]>) {
  const filteredHeaders = new Headers()
  for (const [key, value] of Object.entries(headers)) {
    if (
      !value ||
      key.toLowerCase() === 'host' ||
      key.toLowerCase() === 'content-length'
    ) {
      continue
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        filteredHeaders.append(key, item)
      }
      continue
    }
    filteredHeaders.set(key, value)
  }
  return filteredHeaders
}

async function runRuntimeTests(targetName: RuntimeTarget, baseUrl: string) {
  if (targetName === 'dev' || targetName === 'standalone') {
    const mcpBaseUrl = `http://127.0.0.1:${mcpPorts[targetName]}`
    startProcess('mcp', 'yarn', ['run', 'start:mcp:http'], {
      ...sharedRuntimeEnv,
      MCP_PORT: String(mcpPorts[targetName]),
    })
    await waitForServer(mcpBaseUrl)
    await runCommand(
      'bash',
      [
        'run-tests.sh',
        '--no-start',
        '--url',
        baseUrl,
        '--http',
        '--websocket',
        '--http-sse',
        '--workflow',
        '--cli',
      ],
      {
        ...sharedRuntimeEnv,
        PIKKU_WS_URL: `${toWsUrl(baseUrl)}/cli/todo-cli`,
      }
    )
    await runCommand('yarn', ['run', 'test:runtime-rpc'], {
      ...sharedRuntimeEnv,
      TODO_APP_URL: baseUrl,
    })
    await runCommand('yarn', ['run', 'test:queue'], sharedRuntimeEnv)
    await runCommand('yarn', ['run', 'test:triggers'], sharedRuntimeEnv)
    await runCommand('yarn', ['run', 'test:mcp:http'], {
      ...sharedRuntimeEnv,
      MCP_BASE_URL: mcpBaseUrl,
    })
    return
  }

  await runCommand(
    'bash',
    [
      'run-tests.sh',
      '--no-start',
      '--url',
      baseUrl,
      '--http',
      '--rpc',
      '--http-sse',
      '--workflow',
    ],
    sharedRuntimeEnv
  )
  await runCommand('yarn', ['run', 'test:runtime-rpc'], {
    ...sharedRuntimeEnv,
    TODO_APP_URL: baseUrl,
  })
}

async function waitForServer(baseUrl: string) {
  const url = new URL(baseUrl)
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const socket = await fetch(baseUrl, { method: 'HEAD' })
      socket.body?.cancel()
      return
    } catch {}

    try {
      const connection = await new Promise<boolean>((resolve) => {
        const socket = net.createConnection(
          {
            host: url.hostname,
            port: parseInt(
              url.port || (url.protocol === 'https:' ? '443' : '80'),
              10
            ),
          },
          () => {
            socket.destroy()
            resolve(true)
          }
        )
        socket.on('error', () => resolve(false))
      })
      if (connection) {
        return
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error(`Server failed to start: ${baseUrl}`)
}

function toWsUrl(baseUrl: string) {
  return baseUrl.replace('http://', 'ws://').replace('https://', 'wss://')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
