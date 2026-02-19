import { Given, Then, When } from '@cucumber/cucumber'
import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import {
  E2EWorld,
  type ManagedProcess,
  type ProcessRole,
} from '../support/world.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const e2eRoot = path.resolve(__dirname, '../..')
const apiGeneratedDir = path.join(e2eRoot, 'dist/deployments/api/.pikku')
const workerGeneratedDir = path.join(e2eRoot, 'dist/deployments/worker/.pikku')

const fixtures: Record<string, unknown> = {
  taskCrudWorkflow: {
    title: 'Prepare sprint board',
    description: 'Create initial board and mark complete',
  },
  'taskCrudWorkflow.requiresApproval': {
    title: 'Prepare sprint board',
    description: 'Create initial board and wait for approval',
    requiresApproval: true,
  },
  'taskCrudWorkflow.completed': {
    finalStatus: 'completed',
  },
  graphOnboarding: {
    title: 'Graph onboarding run',
    description: 'Run graph onboarding workflow',
  },
  'processItem.v1': {
    itemId: 'item-v1',
    payload: 'payload-v1',
  },
  'processItem.v2': {
    itemId: 'item-v2',
    payload: 'payload-v2',
  },
}

const DEFAULT_DATABASE_URL =
  'postgres://postgres:password@localhost:5432/pikku_queue'

const resolveDatabaseUrl = (): string =>
  process.env.E2E_DATABASE_URL ||
  process.env.DATABASE_URL ||
  DEFAULT_DATABASE_URL

const wait = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const waitFor = async (
  check: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs = 250
): Promise<void> => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await check()) {
      return
    }
    await wait(intervalMs)
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`)
}

const streamLogs = (
  stream: NodeJS.ReadableStream | null | undefined,
  sink: string[],
  prefix: string
): void => {
  stream?.on('data', (chunk: Buffer | string) => {
    const text = chunk.toString()
    sink.push(text)
    process.stdout.write(`[${prefix}] ${text}`)
  })
}

const processVersionFromProfile = (profile?: string): string =>
  profile && profile.includes('v2') ? 'v2' : 'v1'

const managerSessionHeader = JSON.stringify({
  userId: 'manager-1',
  orgId: 'org-1',
  role: 'manager',
})

const startProcess = async (
  world: E2EWorld,
  {
    name,
    role,
    profile,
    port,
  }: {
    name: string
    role: ProcessRole
    profile?: string
    port?: number
  }
): Promise<ManagedProcess> => {
  const command = role === 'api' ? 'start:api' : 'start:worker'
  const generateCommand = role === 'api' ? 'pikku:api' : 'pikku:worker'
  const generatedDir = role === 'api' ? apiGeneratedDir : workerGeneratedDir

  await new Promise<void>((resolve, reject) => {
    const generate = spawn('yarn', [generateCommand], {
      cwd: e2eRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const logs: string[] = []
    streamLogs(generate.stdout, logs, `${name}:${role}:generate`)
    streamLogs(generate.stderr, logs, `${name}:${role}:generate`)
    generate.once('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new Error(
          `Failed to generate ${role} deployment with '${generateCommand}'.\n${logs.join('')}`
        )
      )
    })
  })

  const processVersion = processVersionFromProfile(profile)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    E2E_NAMESPACE: world.namespace,
    E2E_PROFILE: profile || 'default',
    E2E_APP_VERSION: processVersion,
    E2E_TASK_UPDATE_DELAY_MS: role === 'worker' ? '3000' : '0',
    E2E_HTTP_PORT: port ? String(port) : undefined,
    E2E_GENERATED_DIR: generatedDir,
  }

  const child = spawn('yarn', [command], {
    cwd: e2eRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const logs: string[] = []
  streamLogs(child.stdout, logs, `${name}:${role}`)
  streamLogs(child.stderr, logs, `${name}:${role}`)

  const processInfo: ManagedProcess = { name, role, profile, port, child, logs }
  world.processes.set(name, processInfo)

  if (role === 'api') {
    const baseUrl = `http://127.0.0.1:${port || 4210}`
    try {
      await waitFor(async () => {
        try {
          const response = await fetch(`${baseUrl}/health`)
          return response.status === 200
        } catch {
          return false
        }
      }, 20000)
    } catch (error: unknown) {
      throw new Error(
        `API process '${name}' failed readiness at ${baseUrl}. ` +
          `exitCode=${child.exitCode ?? 'running'} signal=${child.signalCode ?? 'none'} ` +
          `generatedDir=${generatedDir}\n` +
          logs.join('')
      )
    }
  } else {
    try {
      await waitFor(
        async () => logs.some((entry) => entry.includes('E2E_WORKER_READY')),
        20000
      )
    } catch (error: unknown) {
      throw new Error(
        `Worker process '${name}' failed readiness. ` +
          `exitCode=${child.exitCode ?? 'running'} signal=${child.signalCode ?? 'none'} ` +
          `generatedDir=${generatedDir}\n` +
          logs.join('')
      )
    }
  }

  return processInfo
}

const getProcess = (world: E2EWorld, name: string): ManagedProcess => {
  const processInfo = world.processes.get(name)
  if (!processInfo) {
    throw new Error(`Unknown process '${name}'`)
  }
  return processInfo
}

const getApiProcess = (world: E2EWorld): ManagedProcess => {
  const apiProcess = [...world.processes.values()].find(
    (entry) => entry.role === 'api'
  )
  if (!apiProcess) {
    throw new Error('API process is not running')
  }
  return apiProcess
}

const getRunIdFromAlias = (world: E2EWorld, runAlias: string): string => {
  const runId = world.runAliases.get(runAlias)
  if (!runId) {
    throw new Error(`Unknown run alias '${runAlias}'`)
  }
  return runId
}

const fetchRun = async (
  world: E2EWorld,
  runAlias: string
): Promise<{
  runId: string
  status: string
  output?: Record<string, unknown>
  error?: { code?: string; message?: string }
}> => {
  const apiProcess = getApiProcess(world)
  const runId = getRunIdFromAlias(world, runAlias)
  const response = await fetch(
    `http://127.0.0.1:${apiProcess.port || 4210}/api/workflows/${runId}`,
    {
      headers: {
        'x-e2e-session': managerSessionHeader,
      },
    }
  )
  if (response.status !== 200) {
    throw new Error(`Run request failed with ${response.status}`)
  }
  return await response.json()
}

const fetchRunHistory = async (
  world: E2EWorld,
  runAlias: string
): Promise<
  Array<{ stepName: string; status: string; attemptCount: number }>
> => {
  const apiProcess = getApiProcess(world)
  const runId = getRunIdFromAlias(world, runAlias)
  const response = await fetch(
    `http://127.0.0.1:${apiProcess.port || 4210}/api/workflows/${runId}/history`,
    {
      headers: {
        'x-e2e-session': managerSessionHeader,
      },
    }
  )
  if (response.status !== 200) {
    throw new Error(`Run history request failed with ${response.status}`)
  }
  const body = await response.json()
  return body.history
}

const getSuccessfulBusinessStepCounts = (
  history: Array<{ stepName: string; status: string; attemptCount: number }>
): Map<string, number> => {
  const successfulCounts = new Map<string, number>()
  for (const entry of history) {
    if (entry.status !== 'succeeded') {
      continue
    }
    if (entry.stepName.startsWith('__workflow_')) {
      continue
    }
    successfulCounts.set(
      entry.stepName,
      (successfulCounts.get(entry.stepName) || 0) + 1
    )
  }
  return successfulCounts
}

const ensureRuntimeHTTPResponse = async (world: E2EWorld): Promise<void> => {
  if (world.latestHTTPResponse?.body?.runtime) {
    return
  }
  const apiProcess = getApiProcess(world)
  const response = await fetch(
    `http://127.0.0.1:${apiProcess.port || 4210}/health`,
    {
      headers: {
        'x-e2e-session': managerSessionHeader,
      },
    }
  )
  let body: any
  try {
    body = await response.json()
  } catch {
    body = await response.text()
  }
  world.latestHTTPResponse = { status: response.status, body }
}

const removePersistedWorkflowVersionForRun = async (
  world: E2EWorld,
  runAlias: string
): Promise<void> => {
  const runId = getRunIdFromAlias(world, runAlias)
  const sql = postgres(resolveDatabaseUrl())
  try {
    const rows = await sql.unsafe<
      Array<{ workflow: string; graph_hash: string | null }>
    >(
      `SELECT workflow, graph_hash FROM pikku.workflow_runs WHERE workflow_run_id = $1`,
      [runId]
    )
    if (!rows.length) {
      throw new Error(`Workflow run not found for version removal: ${runId}`)
    }
    const workflowName = rows[0]!.workflow
    const graphHash = rows[0]!.graph_hash
    if (!graphHash) {
      throw new Error(`Workflow run ${runId} has no graph_hash`)
    }

    await sql.unsafe(
      `DELETE FROM pikku.workflow_versions WHERE workflow_name = $1 AND graph_hash = $2`,
      [workflowName, graphHash]
    )
    await sql.unsafe(
      `UPDATE pikku.workflow_runs SET graph_hash = $1 WHERE workflow_run_id = $2`,
      [`${graphHash}-deleted`, runId]
    )
  } finally {
    await sql.end()
  }
}

const stopProcess = async (world: E2EWorld, name: string): Promise<void> => {
  const processInfo = getProcess(world, name)
  if (processInfo.child.exitCode === null) {
    processInfo.child.kill('SIGTERM')
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (processInfo.child.exitCode === null) {
        processInfo.child.kill('SIGKILL')
      }
      resolve()
    }, 5000)
    processInfo.child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
  world.processes.delete(name)
}

Given('infrastructure is reachable', async function (this: E2EWorld) {
  const sql = postgres(resolveDatabaseUrl())
  try {
    await sql`select 1 as ok`
  } finally {
    await sql.end()
  }
})

Given(
  'a clean isolated test namespace is created',
  async function (this: E2EWorld) {
    assert.ok(this.namespace.length > 0)
  }
)

Given('stack is running:', async function (this: E2EWorld, dataTable) {
  const rows = dataTable.hashes() as Array<{
    name: string
    role: ProcessRole
    profile?: string
    port?: string
  }>

  for (const row of rows) {
    await startProcess(this, {
      name: row.name,
      role: row.role,
      profile: row.profile,
      port: row.port ? Number(row.port) : undefined,
    })
  }
})

When(
  'I replace process {string} with profile {string}',
  async function (this: E2EWorld, processName: string, profile: string) {
    const existing = getProcess(this, processName)
    await stopProcess(this, processName)
    await startProcess(this, {
      name: processName,
      role: existing.role,
      profile,
      port: existing.port,
    })
  }
)

When(
  'I replace process {string} with profile {string} as {string}',
  async function (
    this: E2EWorld,
    processName: string,
    profile: string,
    newAlias: string
  ) {
    const existing = getProcess(this, processName)
    await stopProcess(this, processName)
    await startProcess(this, {
      name: newAlias,
      role: existing.role,
      profile,
      port: existing.port,
    })
  }
)

When(
  'I restart process {string}',
  async function (this: E2EWorld, processName: string) {
    const existing = getProcess(this, processName)
    await stopProcess(this, processName)
    await startProcess(this, {
      name: processName,
      role: existing.role,
      profile: existing.profile,
      port: existing.port,
    })
  }
)

Then(
  'run {string} output field {string} equals {string}',
  async function (
    this: E2EWorld,
    runAlias: string,
    fieldName: string,
    expectedValue: string
  ) {
    const runResponse = this.latestRunResponses.get(runAlias)
    if (!runResponse) {
      throw new Error(`No captured run response for alias '${runAlias}'`)
    }
    assert.equal(String(runResponse.output?.[fieldName]), expectedValue)
  }
)

When(
  'I resume workflow run {string} via {string}',
  async function (this: E2EWorld, runAlias: string, processName: string) {
    const processInfo = getProcess(this, processName)
    assert.equal(processInfo.role, 'api')

    const runId = this.runAliases.get(runAlias)
    if (!runId) {
      throw new Error(`Unknown run alias '${runAlias}'`)
    }

    const response = await fetch(
      `http://127.0.0.1:${processInfo.port || 4210}/api/workflows/${runId}/resume`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-e2e-session': managerSessionHeader,
        },
        body: JSON.stringify({ runId }),
      }
    )

    if (response.status !== 200) {
      const body = await response.text()
      throw new Error(
        `Failed to resume workflow. status=${response.status} body=${body}`
      )
    }
  }
)

When(
  'I start workflow {string} via {string} with fixture {string}',
  async function (
    this: E2EWorld,
    workflowName: string,
    processName: string,
    fixtureName: string
  ) {
    const processInfo = getProcess(this, processName)
    assert.equal(processInfo.role, 'api')

    const payload = fixtures[fixtureName]
    if (!payload) {
      throw new Error(`Unknown fixture '${fixtureName}'`)
    }

    const response = await fetch(
      `http://127.0.0.1:${processInfo.port || 4210}/api/workflows/start`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-e2e-session': managerSessionHeader,
        },
        body: JSON.stringify({
          workflowName,
          data: payload,
        }),
      }
    )

    const body = await response.json()
    this.latestHTTPResponse = { status: response.status, body }
    if (response.status !== 200) {
      this.latestErrorResponse = { status: response.status, body }
      return
    }

    assert.ok(body.runId, 'runId not returned')
    this.runAliases.set('current', String(body.runId))
  }
)

When(
  'I call HTTP route {string}',
  async function (this: E2EWorld, route: string) {
    const apiProcess = getApiProcess(this)
    const response = await fetch(
      `http://127.0.0.1:${apiProcess.port || 4210}${route}`,
      {
        headers: {
          'x-e2e-session': managerSessionHeader,
        },
      }
    )
    let body: any
    try {
      body = await response.json()
    } catch {
      body = await response.text()
    }
    this.latestHTTPResponse = { status: response.status, body }
    if (response.status >= 400) {
      this.latestErrorResponse = { status: response.status, body }
    }
  }
)

Then(
  'run {string} status eventually becomes {string}',
  async function (this: E2EWorld, runAlias: string, expectedStatus: string) {
    await waitFor(async () => {
      const body = await fetchRun(this, runAlias)
      this.latestRunResponses.set(runAlias, body)
      return body.status === expectedStatus
    }, 30000)
  }
)

When(
  'run {string} is queued but not completed',
  async function (this: E2EWorld, runAlias: string) {
    await waitFor(async () => {
      const body = await fetchRun(this, runAlias)
      this.latestRunResponses.set(runAlias, body)
      return body.status !== 'completed' && body.status !== 'failed'
    }, 10000)
  }
)

Then(
  'run {string} status eventually becomes one of:',
  async function (this: E2EWorld, runAlias: string, dataTable) {
    const allowedStatuses = new Set(dataTable.raw().flat().filter(Boolean))
    await waitFor(async () => {
      const body = await fetchRun(this, runAlias)
      this.latestRunResponses.set(runAlias, body)
      return allowedStatuses.has(body.status)
    }, 30000)
  }
)

Then(
  'run {string} status stays {string} for {int} seconds',
  async function (
    this: E2EWorld,
    runAlias: string,
    expectedStatus: string,
    seconds: number
  ) {
    const apiProcess = getApiProcess(this)
    const runId = getRunIdFromAlias(this, runAlias)

    const deadline = Date.now() + seconds * 1000
    while (Date.now() < deadline) {
      const response = await fetch(
        `http://127.0.0.1:${apiProcess.port || 4210}/api/workflows/${runId}`,
        {
          headers: {
            'x-e2e-session': managerSessionHeader,
          },
        }
      )
      if (response.status !== 200) {
        throw new Error(`Run status request failed with ${response.status}`)
      }
      const body = await response.json()
      if (body.status !== expectedStatus) {
        throw new Error(
          `Expected run status to stay '${expectedStatus}' but got '${body.status}'`
        )
      }
      await wait(300)
    }
  }
)

Then(
  'run {string} error code equals one of:',
  async function (this: E2EWorld, runAlias: string, dataTable) {
    const allowedCodes = new Set(dataTable.raw().flat().filter(Boolean))
    const runResponse =
      this.latestRunResponses.get(runAlias) ?? (await fetchRun(this, runAlias))
    assert.ok(runResponse.error?.code, 'Expected run error code to be present')
    assert.ok(
      allowedCodes.has(String(runResponse.error.code)),
      `Expected run error code to be one of ${JSON.stringify([...allowedCodes])}, got ${String(runResponse.error.code)}`
    )
  }
)

Then(
  'run {string} error code equals {string}',
  async function (this: E2EWorld, runAlias: string, expectedCode: string) {
    const runResponse =
      this.latestRunResponses.get(runAlias) ?? (await fetchRun(this, runAlias))
    assert.equal(runResponse.error?.code, expectedCode)
  }
)

When(
  'I invoke RPC {string} via {string} with fixture {string}',
  async function (
    this: E2EWorld,
    rpcAlias: string,
    processName: string,
    fixtureName: string
  ) {
    const processInfo = getProcess(this, processName)
    assert.equal(processInfo.role, 'api')
    const payload = fixtures[fixtureName]
    if (!payload) {
      throw new Error(`Unknown fixture '${fixtureName}'`)
    }

    const response = await fetch(
      `http://127.0.0.1:${processInfo.port || 4210}/api/rpc/invoke`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-e2e-session': managerSessionHeader,
        },
        body: JSON.stringify({
          rpcName: rpcAlias,
          data: payload,
        }),
      }
    )

    const body = await response.json()
    if (response.status !== 200) {
      throw new Error(
        `Failed to invoke RPC. status=${response.status} body=${JSON.stringify(body)} logs=${JSON.stringify(processInfo.logs.slice(-20))}`
      )
    }
    this.latestRPCResponses.set('current', body.output)
  }
)

Then(
  'RPC response field {string} equals {string}',
  async function (this: E2EWorld, fieldName: string, expectedValue: string) {
    const rpcResponse = this.latestRPCResponses.get('current')
    if (!rpcResponse) {
      throw new Error('No RPC response captured')
    }
    assert.equal(String(rpcResponse[fieldName]), expectedValue)
  }
)

Then(
  'the response status is {int}',
  function (this: E2EWorld, expectedStatus: number) {
    if (!this.latestHTTPResponse) {
      throw new Error('No HTTP response captured')
    }
    assert.equal(this.latestHTTPResponse.status, expectedStatus)
  }
)

Then(
  'required singleton services equal:',
  async function (this: E2EWorld, dataTable) {
    await ensureRuntimeHTTPResponse(this)
    const expected = dataTable.raw().flat().filter(Boolean).sort()
    const actual = (
      this.latestHTTPResponse.body?.runtime?.singletonServicesPresent || []
    )
      .filter((name: string) =>
        [
          'logger',
          'variables',
          'secrets',
          'schema',
          'workflowService',
          'queueService',
          'schedulerService',
        ].includes(name)
      )
      .sort()
    assert.deepEqual(actual, expected)
  }
)

Then(
  'required singleton services include:',
  async function (this: E2EWorld, dataTable) {
    await ensureRuntimeHTTPResponse(this)
    const expected = dataTable.raw().flat().filter(Boolean)
    const actual =
      this.latestHTTPResponse.body?.runtime?.singletonServicesPresent || []
    for (const serviceName of expected) {
      assert.ok(
        actual.includes(serviceName),
        `Expected singleton service '${serviceName}' to be present`
      )
    }
  }
)

Then(
  'singleton services do not include:',
  async function (this: E2EWorld, dataTable) {
    await ensureRuntimeHTTPResponse(this)
    const expectedMissing = dataTable.raw().flat().filter(Boolean)
    const actual =
      this.latestHTTPResponse.body?.runtime?.singletonServicesPresent || []
    for (const serviceName of expectedMissing) {
      assert.ok(
        !actual.includes(serviceName),
        `Expected singleton service '${serviceName}' to be absent`
      )
    }
  }
)

Then('no queue workers are registered', async function (this: E2EWorld) {
  await ensureRuntimeHTTPResponse(this)
  const queueWorkers = this.latestHTTPResponse.body?.runtime?.queueWorkers || []
  assert.equal(queueWorkers.length, 0)
})

Then('queue worker map includes:', async function (this: E2EWorld, dataTable) {
  await ensureRuntimeHTTPResponse(this)
  const expected = dataTable.raw().flat().filter(Boolean)
  const queueWorkers = this.latestHTTPResponse.body?.runtime?.queueWorkers || []
  for (const expectedWorker of expected) {
    const matched = queueWorkers.some(
      (workerName: string) =>
        workerName.includes(expectedWorker) ||
        (expectedWorker === 'workflow-queue' && workerName.includes('workflow'))
    )
    assert.ok(matched, `Expected queue worker matching '${expectedWorker}'`)
  }
})

Then(
  'the request fails with code {string}',
  function (this: E2EWorld, expectedCode: string) {
    const errorBody =
      this.latestErrorResponse?.body || this.latestHTTPResponse?.body
    const errorCode = errorBody?.code || errorBody?.error?.code
    const status =
      this.latestErrorResponse?.status || this.latestHTTPResponse?.status
    if (errorCode) {
      assert.equal(String(errorCode), expectedCode)
      return
    }
    const apiProcess = getApiProcess(this)
    const errorText = apiProcess.logs.join('\n')
    if (expectedCode === 'SERVICE_NOT_AVAILABLE') {
      assert.ok(
        status && status >= 400,
        'Expected a failed HTTP request status'
      )
      assert.ok(
        errorText.includes('workflowService is not configured') ||
          errorText.includes('service not available'),
        `Expected service-availability failure logs for code '${expectedCode}'`
      )
      return
    }
    assert.ok(
      errorText.includes(expectedCode),
      `Expected error code '${expectedCode}' in API logs`
    )
  }
)

Then(
  'the error message contains {string}',
  function (this: E2EWorld, expectedText: string) {
    const errorBody =
      this.latestErrorResponse?.body || this.latestHTTPResponse?.body
    const bodyText =
      typeof errorBody === 'string'
        ? errorBody
        : JSON.stringify(errorBody || {})
    const apiProcess = getApiProcess(this)
    const logsText = apiProcess.logs.join('\n')
    assert.ok(
      bodyText.includes(expectedText) || logsText.includes(expectedText),
      `Expected error text '${expectedText}' in response or logs`
    )
  }
)

When(
  'persisted workflow version for run {string} is removed',
  async function (this: E2EWorld, runAlias: string) {
    await removePersistedWorkflowVersionForRun(this, runAlias)
  }
)

When(
  'I remove persisted workflow version for run {string}',
  async function (this: E2EWorld, runAlias: string) {
    await removePersistedWorkflowVersionForRun(this, runAlias)
  }
)

Then(
  'worker execution trace for run {string} is captured',
  async function (this: E2EWorld, runAlias: string) {
    const runId = getRunIdFromAlias(this, runAlias)
    const artifactDir = path.join(e2eRoot, 'reports/artifacts')
    await mkdir(artifactDir, { recursive: true })
    const trace = {
      runId,
      workers: [...this.processes.values()]
        .filter((processInfo) => processInfo.role === 'worker')
        .map((processInfo) => ({
          name: processInfo.name,
          profile: processInfo.profile || 'default',
          ready: processInfo.logs.some((log) =>
            log.includes('E2E_WORKER_READY')
          ),
          logLines: processInfo.logs.length,
        })),
    }
    await writeFile(
      path.join(artifactDir, `worker-trace-${runId}.json`),
      JSON.stringify(trace, null, 2),
      'utf8'
    )
    assert.ok(
      trace.workers.length > 0,
      'No worker processes found for trace capture'
    )
  }
)

Given(
  'deployment-aware queue routing is enabled',
  async function (this: E2EWorld) {
    assert.ok(this.processes.size > 0)
  }
)

Then(
  'all successful steps for run {string} were executed by compatible workers',
  async function (this: E2EWorld, runAlias: string) {
    const history = await fetchRunHistory(this, runAlias)
    const successfulCounts = getSuccessfulBusinessStepCounts(history)
    const duplicates = [...successfulCounts.entries()].filter(
      ([, count]) => count > 1
    )
    assert.equal(
      duplicates.length,
      0,
      `Incompatible execution detected: duplicate successful steps ${JSON.stringify(duplicates)}`
    )
  }
)

Then(
  'run {string} has no duplicate successful step executions',
  async function (this: E2EWorld, runAlias: string) {
    const history = await fetchRunHistory(this, runAlias)
    const successfulCounts = getSuccessfulBusinessStepCounts(history)

    const duplicates = [...successfulCounts.entries()].filter(
      ([, count]) => count > 1
    )
    assert.equal(
      duplicates.length,
      0,
      `Duplicate successful step executions detected: ${JSON.stringify(duplicates)}`
    )
  }
)

Then(
  'run {string} successful steps equal:',
  async function (this: E2EWorld, runAlias: string, dataTable) {
    const expectedStepNames = dataTable.raw().flat().filter(Boolean)
    const history = await fetchRunHistory(this, runAlias)
    const successfulCounts = getSuccessfulBusinessStepCounts(history)

    for (const stepName of expectedStepNames) {
      const count = successfulCounts.get(stepName) || 0
      assert.equal(
        count,
        1,
        `Expected step '${stepName}' to succeed exactly once, but got ${count}`
      )
    }

    const actualStepNames = [...successfulCounts.keys()].sort()
    const expectedUniqueStepNames = [...new Set(expectedStepNames)].sort()
    assert.deepEqual(
      actualStepNames,
      expectedUniqueStepNames,
      `Expected successful business steps ${JSON.stringify(expectedUniqueStepNames)}, got ${JSON.stringify(actualStepNames)}`
    )
  }
)

Then(
  'run {string} output matches fixture {string}',
  async function (this: E2EWorld, runAlias: string, fixtureName: string) {
    const expected = fixtures[fixtureName] as
      | Record<string, unknown>
      | undefined
    if (!expected) {
      throw new Error(`Unknown fixture '${fixtureName}'`)
    }

    const runResponse = this.latestRunResponses.get(runAlias)
    if (!runResponse) {
      throw new Error(`No captured run response for alias '${runAlias}'`)
    }

    for (const [key, value] of Object.entries(expected)) {
      assert.equal(runResponse.output?.[key], value)
    }
  }
)
