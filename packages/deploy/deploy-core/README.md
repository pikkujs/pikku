# @pikku/deploy

The shared contract between the Pikku deploy pipeline and the provider adapters
that plug into it.

It holds three things:

- **`DeploymentManifest` and friends** — the provider-agnostic description of
  what a project deploys to: units, queues, scheduled tasks, channels, agents,
  MCP endpoints, workflows, secrets and variables.
- **`ProviderAdapter`** — the interface every provider implements to supply the
  provider-specific parts: entry generation, config files, infra manifests and
  the deploy call itself.
- **`nodeBuiltinExternals()`** — the esbuild externals list for providers whose
  runtime is Node.js, derived from the running Node rather than hand-written.

Nothing here executes at request time; it is a build-time package that the CLI
and the `@pikku/deploy-*` adapters share so the manifest has one definition
instead of one per adapter.

```ts
import type { ProviderAdapter, EntryGenerationContext } from '@pikku/deploy'
import { nodeBuiltinExternals } from '@pikku/deploy'

export class MyProviderAdapter implements ProviderAdapter {
  readonly name = 'my-provider'
  readonly deployDirName = 'my-provider'

  getExternals(): string[] {
    return nodeBuiltinExternals('@my-sdk/*')
  }

  generateEntrySource(ctx: EntryGenerationContext): string {
    return `import './${ctx.bootstrapPath}'`
  }

  // …
}
```
