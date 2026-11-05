/**
 * The calls the CLI makes that the published `@pikkustudio/addon-cloud-api`
 * contract does not carry, typed by hand because no contract exists to
 * generate them from.
 *
 * - `requestCliAuth`, `pollCliAuth`, `submitFinding` live in the controlplane's
 *   `api-functions` package itself and are served bare, before anyone has a
 *   session. They belong to no addon, so no SDK describes them.
 * - `createSandboxChange` is in `@pikkustudio/addon-machine-api`, wired as
 *   `machine`; that addon publishes no SDK yet.
 *
 * - `getProjectAspirations`, `ensureProjectAspirations`, `reactToProjectAspiration`
 *   are cloud functions (served `cloud:`) added after the last published
 *   cloud-api (0.0.2), called by the pikku-console addon. TEMPORARY: publish a
 *   newer @pikkustudio/addon-cloud-api, run `bun run sync-contract`, delete them.
 *
 * Keep this list to what the contract genuinely cannot cover. When either
 * source publishes an SDK, generate it like cloud-api and delete the entry.
 */
type Aspiration = {
  title: string
  line: string
  reaction: ('liked' | 'disliked') | null
  likes: number
  dislikes: number
  likedBy: string[]
  dislikedBy: string[]
}

export type UncontractedRPCMap = {
  ensureProjectAspirations: {
    input: { projectId: string; sandboxId?: string }
    output: {
      aspirations: Aspiration[]
      sourceDigest: string
      status: 'ready' | 'generating'
    }
  }
  getProjectAspirations: {
    input: { projectId: string; sourceDigest: string }
    output: { aspirations: Aspiration[] }
  }
  reactToProjectAspiration: {
    input: {
      projectId: string
      title: string
      reaction: ('liked' | 'disliked') | null
    }
    output: { reaction: ('liked' | 'disliked') | null }
  }
  requestCliAuth: {
    input: void
    output: { code: string; deviceCode: string; expiresAt: string }
  }
  pollCliAuth: {
    input: { deviceCode?: string; code?: string }
    output: {
      status: 'pending' | 'confirmed' | 'consumed' | 'expired' | 'rejected'
      token?: string
    }
  }
  submitFinding: {
    input: {
      finding: {
        runId: string
        title: string
        kind: 'product' | 'harness'
        model: string
        expected: string
        actual: string
        skill?: string
        passage?: string
        command?: string
        error?: string
        repro?: string
        workaround?: string
        proposal?: string
        tried?: string
        unresolved?: boolean
        area?: string
        surface?: 'local' | 'deployed' | 'both'
        cost?: string
        deployTarget?: string
        environment: { [key: string]: unknown }
        reportedAt: string
      }
    }
    output: { findingId: string }
  }
  createSandboxChange: {
    input: { title: string; body?: string; route?: string }
    output: {
      change: { changeId: string; shortId: string; title: string }
    }
  }
}

/**
 * The bare names callers use for these, and where each is served. Everything
 * else the CLI calls is a function of the contract and is served `cloud:`.
 */
export const UNCONTRACTED_SERVED_AS = {
  requestCliAuth: 'requestCliAuth',
  pollCliAuth: 'pollCliAuth',
  submitFinding: 'submitFinding',
  createSandboxChange: 'machine:createSandboxChange',
  ensureProjectAspirations: 'cloud:ensureProjectAspirations',
  getProjectAspirations: 'cloud:getProjectAspirations',
  reactToProjectAspiration: 'cloud:reactToProjectAspiration',
} as const
