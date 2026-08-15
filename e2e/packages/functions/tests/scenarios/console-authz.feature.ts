/**
 * The @pikku/addon-console package ships credential, source-editing and install
 * RPCs with no authorization of their own — so, before this gate, any signed-in
 * user could read another user's OAuth token via `console:credentialGet` by
 * passing their userId. A single global permission registered under the addon's
 * package namespace (see `src/console-authz.ts`) gates every one of its
 * functions at once: a signed-in non-admin is refused, only an admin passes.
 *
 * The `admin` actor holds the umbrella `admin` scope and the `guest` actor
 * holds only `report-viewer`, which is what makes the pair the gate's two
 * sides.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/scenarios/pikku-scenario-types.gen.js'

const CREDENTIAL_GET = 'console:credentialGet'
const FUNCTIONS_META = 'console:getFunctionsMeta'
const DIRECTORY = 'pikkuAdminListUsers'
const SCENARIO_RUNS = 'console:listScenarioRuns'

/** The sharp edge: credential read returns a resolved access token. */
export const consoleAuthzNonAdminCredentialReadScenario = pikkuScenario<
  void,
  { status: 403 }
>({
  title: 'A non-admin is refused a console credential read',
  description: 'The addon-wide gate refuses a signed-in non-admin',
  tags: ['scenario', 'console-authz'],
  func: async (_services, _data, { scenario, actors }) => {
    const call = await scenario.when(
      'the guest reads a credential',
      'invokesRpcRaw',
      { rpcName: CREDENTIAL_GET, data: { name: 'user-oauth' } },
      { actor: actors.guest }
    )
    await scenario.then(
      'sees it forbidden',
      'expectsRpcResponse',
      { call, status: 403 },
      { actor: actors.guest }
    )
    return { status: 403 }
  },
})

export const consoleAuthzAdminCredentialReadScenario = pikkuScenario<
  void,
  { allowed: true }
>({
  title: 'An admin may call the console credential read',
  description: 'The gate opens for the umbrella admin scope',
  tags: ['scenario', 'console-authz'],
  func: async (_services, _data, { scenario, actors }) => {
    const call = await scenario.when(
      'the admin reads a credential',
      'invokesRpcRaw',
      { rpcName: CREDENTIAL_GET, data: { name: 'user-oauth' } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the call allowed',
      'expectsRpcAllowed',
      { call },
      { actor: actors.admin }
    )
    return { allowed: true }
  },
})

/** The vulnerability itself: reaching for ANOTHER user's credential by id. */
export const consoleAuthzNonAdminCannotReachAnotherUserScenario = pikkuScenario<
  void,
  { status: 403 }
>({
  title:
    "A non-admin cannot read another user's credential by passing a userId",
  description: 'Naming a victim does not widen the gate',
  tags: ['scenario', 'console-authz'],
  func: async (_services, _data, { scenario, actors }) => {
    const call = await scenario.when(
      "the guest reads someone else's credential",
      'invokesRpcRaw',
      {
        rpcName: CREDENTIAL_GET,
        data: { name: 'user-oauth', userId: 'someone-else' },
      },
      { actor: actors.guest }
    )
    await scenario.then(
      'sees it forbidden',
      'expectsRpcResponse',
      { call, status: 403 },
      { actor: actors.guest }
    )
    return { status: 403 }
  },
})

/**
 * One registration covers the whole surface, not just credentials — a different
 * privilege class (metadata read) is gated by the same global.
 */
export const consoleAuthzNonAdminMetadataScenario = pikkuScenario<
  void,
  { status: 403 }
>({
  title: 'The gate covers a different console endpoint too',
  description: 'Metadata read is refused by the same global permission',
  tags: ['scenario', 'console-authz'],
  func: async (_services, _data, { scenario, actors }) => {
    const call = await scenario.when(
      'the guest reads console metadata',
      'invokesRpcRaw',
      { rpcName: FUNCTIONS_META },
      { actor: actors.guest }
    )
    await scenario.then(
      'sees it forbidden',
      'expectsRpcResponse',
      { call, status: 403 },
      { actor: actors.guest }
    )
    return { status: 403 }
  },
})

export const consoleAuthzAdminMetadataScenario = pikkuScenario<
  void,
  { allowed: true }
>({
  title: 'An admin may read console metadata',
  description: 'The same global permission lets an admin through',
  tags: ['scenario', 'console-authz'],
  func: async (_services, _data, { scenario, actors }) => {
    const call = await scenario.when(
      'the admin reads console metadata',
      'invokesRpcRaw',
      { rpcName: FUNCTIONS_META },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the call allowed',
      'expectsRpcAllowed',
      { call },
      { actor: actors.admin }
    )
    return { allowed: true }
  },
})

/**
 * The user directory replaces better-auth's `admin()` list-users endpoint. It
 * additionally declares `admin:users:list`, which the umbrella `admin` grant
 * covers — a caller holding neither gets nothing back.
 */
export const consoleAuthzNonAdminDirectoryScenario = pikkuScenario<
  void,
  { status: 403 }
>({
  title: 'A non-admin is refused the user directory',
  description: 'admin:users:list is not implied by being signed in',
  tags: ['scenario', 'console-authz'],
  func: async (_services, _data, { scenario, actors }) => {
    const call = await scenario.when(
      'the guest reads the directory',
      'invokesRpcRaw',
      { rpcName: DIRECTORY, data: {} },
      { actor: actors.guest }
    )
    await scenario.then(
      'sees it forbidden',
      'expectsRpcResponse',
      { call, status: 403 },
      { actor: actors.guest }
    )
    return { status: 403 }
  },
})

export const consoleAuthzAdminDirectoryScenario = pikkuScenario<
  void,
  { allowed: true }
>({
  title: 'An admin may read the user directory',
  description: 'The umbrella admin scope covers admin:users:list',
  tags: ['scenario', 'console-authz'],
  func: async (_services, _data, { scenario, actors }) => {
    const call = await scenario.when(
      'the admin reads the directory',
      'invokesRpcRaw',
      { rpcName: DIRECTORY, data: {} },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the call allowed',
      'expectsRpcAllowed',
      { call },
      { actor: actors.admin }
    )
    return { allowed: true }
  },
})

/**
 * A run store holds screenshots and footage of the application being used, so
 * the runs the console reads back are behind the same gate as everything else
 * it exposes — not a public archive because it happens to be test output.
 */
export const consoleAuthzNonAdminScenarioRunsScenario = pikkuScenario<
  void,
  { status: 403 }
>({
  title: 'A non-admin is refused the record of past scenario runs',
  description:
    'pikku:console:scenarios:read is not implied by being signed in',
  tags: ['scenario', 'console-authz'],
  func: async (_services, _data, { scenario, actors }) => {
    const call = await scenario.when(
      'the guest lists past runs',
      'invokesRpcRaw',
      { rpcName: SCENARIO_RUNS, data: { limit: 5 } },
      { actor: actors.guest }
    )
    await scenario.then(
      'sees it forbidden',
      'expectsRpcResponse',
      { call, status: 403 },
      { actor: actors.guest }
    )
    return { status: 403 }
  },
})

export const consoleAuthzAdminScenarioRunsScenario = pikkuScenario<
  void,
  { allowed: true }
>({
  title: 'An admin may read the record of past scenario runs',
  description: 'The umbrella admin scope covers pikku:console:scenarios:read',
  tags: ['scenario', 'console-authz'],
  func: async (_services, _data, { scenario, actors }) => {
    const call = await scenario.when(
      'the admin lists past runs',
      'invokesRpcRaw',
      { rpcName: SCENARIO_RUNS, data: { limit: 5 } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the call allowed',
      'expectsRpcAllowed',
      { call },
      { actor: actors.admin }
    )
    return { allowed: true }
  },
})

export const consoleAuthzFeature = pikkuFeature({
  name: "The console addon's privileged RPCs require an admin session",
  description:
    'One global permission under the addon package namespace gates every console function at once',
  tags: ['console-authz'],
  scenarios: [
    consoleAuthzNonAdminCredentialReadScenario,
    consoleAuthzAdminCredentialReadScenario,
    consoleAuthzNonAdminCannotReachAnotherUserScenario,
    consoleAuthzNonAdminMetadataScenario,
    consoleAuthzAdminMetadataScenario,
    consoleAuthzNonAdminDirectoryScenario,
    consoleAuthzAdminDirectoryScenario,
    consoleAuthzNonAdminScenarioRunsScenario,
    consoleAuthzAdminScenarioRunsScenario,
  ],
})
