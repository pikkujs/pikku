import { afterEach, describe, expect, test } from 'bun:test'
import { getCloudRPC } from './http.js'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

const BARE = ['requestCliAuth', 'pollCliAuth', 'submitFinding']
const CLOUD = [
  'addStageCustomHostname',
  'applyDeployment',
  'checkGithubInstall',
  'cloudCliProjects',
  'configureStageChanges',
  'createChange',
  'createStageLink',
  'createStageOperatorToken',
  'deleteStageSecret',
  'deployByStageKind',
  'getCloudLogsByStageKind',
  'getDeploymentBuildLog',
  'getDeploymentStatus',
  'getDeveloperLiteLLMKey',
  'getGitCredential',
  'getProjectDeployments',
  'getProjectDetails',
  'getProjectMetricsByStageKind',
  'getProjectSettings',
  'getProjectStatus',
  'getStageConsoleVariable',
  'getStageDatabaseSchema',
  'getStageSealingKey',
  'getTraceByStageKind',
  'importProject',
  'listDeployments',
  'listDeploymentWorkers',
  'listMyOrganizations',
  'listStageCustomHostnames',
  'listStageMigrationLedger',
  'listStages',
  'listStageSecretNames',
  'provisionRepo',
  'removeStageCustomHostname',
  'rollbackDeployment',
  'rotateStageSealingKey',
  'setProjectRepo',
  'setProjectSettings',
  'setStageAutoDeploy',
  'setStageConsoleVariable',
  'setStageSealedSecret',
  'setStageVisibility',
]

async function urlFor(name: string): Promise<string> {
  let url = ''
  globalThis.fetch = (async (input: any) => {
    url = String(input?.url ?? input)
    return new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  const rpc = getCloudRPC({ apiUrl: 'https://api.example.test', token: 't' })
  await (rpc.invoke as any)(name, {})
  return new URL(url).pathname
}

describe('getCloudRPC rpc names', () => {
  test.each(BARE)('%s is served bare', async (name) => {
    expect(await urlFor(name)).toBe(`/rpc/${name}`)
  })

  test.each(CLOUD)('%s is served under cloud:', async (name) => {
    expect(await urlFor(name)).toBe(`/rpc/cloud:${name}`)
  })

  test('createSandboxChange is served by the machine addon', async () => {
    expect(await urlFor('createSandboxChange')).toBe(
      '/rpc/machine:createSandboxChange'
    )
  })

  test('an already prefixed name is left alone', async () => {
    expect(await urlFor('cloud:listStages')).toBe('/rpc/cloud:listStages')
  })
})
