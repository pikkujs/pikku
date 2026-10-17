/**
 * The pikku function id of the single shared auth handler the CLI generates
 * (`export const authHandler = pikkuSessionlessFunc(...)` in auth.gen.ts). An
 * exported top-level const collapses the catch-all `/api/auth/**` route onto one
 * worker, and the export name becomes the function id. Shared with the CLI
 * codegen and the post-process service stamp so all three agree on the same id
 * without the inspector having to import `@pikku/better-auth`.
 */
export const AUTH_HANDLER_FUNC_ID = 'authHandler'

/**
 * Placeholder recorded when a scenario step's target isn't a static string
 * literal. The step is kept rather than dropped so post-processing can raise
 * PKU678 against it — a dropped step is the silent-failure mode this repo has
 * hit repeatedly on workflow graph round-trips.
 */
export const DYNAMIC_SCENARIO_STEP_TARGET = '<dynamic>'
