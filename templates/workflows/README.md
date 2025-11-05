# Pikku Workflows Template

This template demonstrates how to use Pikku workflows for orchestrating multi-step processes with deterministic replay and step caching.

## Features

- **Workflow orchestration**: Multi-step processes with automatic replay from checkpoints
- **Step caching**: Completed steps are cached and not re-executed on replay
- **RPC steps**: Steps that call other Pikku functions via queue workers
- **Inline steps**: Steps that execute locally with caching
- **Sleep steps**: Time-based delays between workflow steps
- **Queue-based execution**: Remote execution mode using BullMQ

## Getting Started

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

## How It Works

1. Workflows are defined using `pikkuWorkflowFunc` with typed inputs/outputs
2. Workflows are registered using `wireWorkflow` with execution mode configuration
3. The workflow state service (`RedisWorkflowStateService`) stores run state and step results
4. Queue workers (BullMQ) handle asynchronous step execution
5. The orchestrator worker replays the workflow after each step completes

## Workflow State Storage

Workflow state is stored in `.workflows/` directory by default. Each workflow run gets a unique ID and tracks:

- Run status (running, completed, failed)
- Step results (cached for replay)
- Step errors (for debugging failed steps)

## Execution Modes

- **remote**: Steps execute via queue workers (asynchronous, distributed)
- **inline**: Steps execute synchronously in the same process (simpler, single-process)
