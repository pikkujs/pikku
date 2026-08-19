---
'@pikku/cli': patch
---

`pikku dev`: say which AI SDK copies the agent runner is using, and refuse a mismatched pair up front

Resolving `@pikku/ai-vercel` and `@ai-sdk/openai-compatible` from the project's root `package.json` is all-or-nothing, and under an isolated `node_modules` layout (bun, pnpm) the root resolves only what the root itself declares. A monorepo that installed the pair in the workspace that uses them silently got the CLI's own copies instead — which then threw `Unsupported model version v4 …` at the first model call, naming the model and the gateway but neither of the packages that actually disagreed. That case now logs a warning naming the package that could not be resolved.

When the pair does come from the project, their `@ai-sdk/provider` majors are compared before the runner is built. A mismatch disables agents with a message naming both versions and pointing at `@ai-sdk/openai-compatible`'s per-`ai`-major dist-tags, instead of surfacing as a model-spec error later.
