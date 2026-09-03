/**
 * Mapping of service name -> npm module patterns to stub when the service is
 * NOT required by a deployment unit. These are external packages, not gen
 * files: a unit that doesn't wire the service never executes the code path
 * that imports them, so replacing them with `export {}` keeps their (often
 * large) trees out of the bundle.
 *
 * The AI SDKs (@pikku/ai-vercel + @ai-sdk/* + `ai`, ~3MB) are only constructed
 * when a model-bearing service is wired. Every other unit stubs them. The
 * shared services factory must guard the runner construction behind a
 * defined-check on the dynamic import so a stubbed unit simply skips it.
 *
 * Two names reach a model, and both must claim these modules. `agentRunner` is
 * the core AgentRunnerService that runs declared agents; `ai` is not a core
 * service at all but the conventional name for an app's own model wrapper, and
 * the deploy analyzer grants `ai-model` to both (SERVICE_CAPABILITY_MAP). While
 * only `agentRunner` was listed here, a unit that destructured `ai` was given
 * the model capability and had the SDKs stubbed out from under it in the same
 * build — `requiredSingletonServices` says `'agentRunner': false, 'ai': true`
 * and the stub pass read only the first line. That fails the bundle outright
 * ("No matching export in pikku-stub:@pikku/ai-vercel for VercelAgentRunner")
 * rather than degrading, because a unit asking for a model does import them.
 *
 * They share one array so the patterns are identity-equal: getDeadGenFilePatterns
 * decides a module set is dead by comparing pattern sources across services, and
 * two separately-written copies of the same regex would defeat that.
 *
 * It lives in its own module so `pikku validate` can warn about a static import
 * of a stubbed package without pulling the bundler in — a check that reads a
 * second copy of this list would go stale the first time the list changed.
 */
const AI_SDK_MODULES = [/^@pikku\/ai-vercel/, /^@ai-sdk\//, /^ai$/]

export const SERVICE_MODULE_MAP: Record<string, RegExp[]> = {
  agentRunner: AI_SDK_MODULES,
  ai: AI_SDK_MODULES,
}
