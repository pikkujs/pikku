/**
 * Mapping of service name -> npm module patterns to stub when the service is
 * NOT required by a deployment unit. These are external packages, not gen
 * files: a unit that doesn't wire the service never executes the code path
 * that imports them, so replacing them with `export {}` keeps their (often
 * large) trees out of the bundle.
 *
 * The AI SDKs (@pikku/ai-vercel + @ai-sdk/* + `ai`, ~3MB) are only constructed
 * when `agentRunner` is wired (agent units). Every non-agent unit stubs them.
 * The shared services factory must guard the runner construction behind a
 * defined-check on the dynamic import so a stubbed unit simply skips it.
 *
 * It lives in its own module so `pikku validate` can warn about a static import
 * of a stubbed package without pulling the bundler in — a check that reads a
 * second copy of this list would go stale the first time the list changed.
 */
export const SERVICE_MODULE_MAP: Record<string, RegExp[]> = {
  agentRunner: [/^@pikku\/ai-vercel/, /^@ai-sdk\//, /^ai$/],
}
