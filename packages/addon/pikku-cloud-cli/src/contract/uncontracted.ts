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
 * Keep this list to what the contract genuinely cannot cover. When either
 * source publishes an SDK, generate it like cloud-api and delete the entry.
 */
export type UncontractedRPCMap = {
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
  'machine:createSandboxChange': {
    input: { title: string; body?: string; route?: string }
    output: {
      change: { changeId: string; shortId: string; title: string }
    }
  }
}
