# Pikku Workflows Template (Redis)

This template demonstrates Pikku workflows with Redis state storage and BullMQ queue.

## Quick Start

1. Install dependencies:

   ```bash
   yarn install
   ```

2. Start the workflow workers:

   ```bash
   yarn start
   ```

3. The workflow workers will process any queued workflow jobs

## Workflow Examples

See `../functions/src/workflow.functions.ts` and `../functions/src/workflow.wiring.ts` for example workflow definitions.

## Documentation

For complete workflow documentation, see:

- **[Workflows Guide](https://pikku.dev/docs/workflows)** - Overview and core concepts
- **[Getting Started](https://pikku.dev/docs/workflows/getting-started)** - Setup and configuration
- **[Step Types](https://pikku.dev/docs/workflows/steps)** - RPC, inline, sleep steps, and retry options
- **[Configuration](https://pikku.dev/docs/workflows/configuration)** - State storage and execution modes

## Features

- Multi-step workflow orchestration with deterministic replay
- Step caching and retry logic
- Redis state storage with BullMQ queue
- Automatic execution mode detection (remote/inline)
