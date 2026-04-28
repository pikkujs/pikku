# Pikku Meta Contract (MVP)

This document defines the stable CLI contract the planner/executor agents rely on.

## Goals

- Expose introspection helpers for local app generation.
- Keep outputs deterministic and machine-readable.
- Avoid AI-specific naming: this is metadata, not model behavior.

## Command Group

All commands are under:

- `pikku meta ...`

All commands in this contract MUST support:

- `--json` (required; primary mode for agents)
- non-zero exit on failure
- stable top-level response shape

## The Bulk Endpoint (use this first)

### `pikku meta context --json`

Returns the full project context in **one inspection**. This is the
recommended starting point for any planner or codegen agent — calling the
six list endpoints individually spawns the CLI and re-inspects the project
each time, which dominates planner latency.

Targeted `pikku meta * get` calls are still the right tool when the planner
needs full input/output JSON schemas for a specific entry.

Response shape:

```json
{
  "schemaVersion": "meta-context.v1",
  "summary": {
    "functions": 0,
    "middleware": 0,
    "permissions": 0,
    "workflows": 0,
    "wires": { "http": 0, "scheduler": 0, "queue": 0, "channel": 0, "trigger": 0 }
  },
  "capabilities": {
    "http": true,
    "scheduler": false,
    "queue": false,
    "channel": false,
    "trigger": false,
    "workflow": false,
    "mcp": false,
    "agent": false
  },
  "layout": {
    "rootDir": "string",
    "srcDirectories": ["string"],
    "configFile": "string|null",
    "scaffold": {
      "functionDir": "string|null",
      "wiringDir": "string|null",
      "middlewareDir": "string|null",
      "permissionDir": "string|null"
    },
    "globalHTTPPrefix": "string|null"
  },
  "functions": [
    {
      "id": "string",
      "name": "string",
      "description": "string|null",
      "tags": ["string"],
      "sourceFile": "string|null",
      "inputSchemaName": "string|null",
      "outputSchemaName": "string|null",
      "expose": true,
      "readonly": false
    }
  ],
  "middleware": [{ "id": "string", "name": "string", "description": "string|null" }],
  "permissions": [{ "id": "string", "name": "string", "description": "string|null" }],
  "workflows": [{ "id": "string", "name": "string", "description": "string|null", "mode": "inline|distributed" }],
  "wires": {
    "http":      [{ "id": "string", "functionId": "string", "route": "string", "method": "string" }],
    "scheduler": [{ "id": "string", "functionId": "string", "cron": "string|null" }],
    "queue":     [{ "id": "string", "functionId": "string", "queueName": "string|null" }],
    "channel":   [{ "id": "string", "functionId": "string|null", "channelName": "string" }],
    "trigger":   [{ "id": "string", "functionId": "string", "eventType": "string|null" }]
  }
}
```

`capabilities.<type>` is a derived hint based on whether any wires of that
type exist. Use it to constrain proposals (don't suggest websocket wiring
in a project with `capabilities.channel: false` unless the user asked).

## Targeted Endpoints

Use these only when `meta context` doesn't have enough detail (typically:
JSON schemas for input/output, or full step lists for an existing workflow).

### `pikku meta functions list --json`

Returns a lightweight index of callable functions available in the
project/app context.

Response shape:

```json
{
  "functions": [
    {
      "id": "string",
      "name": "string",
      "description": "string|null",
      "tags": ["string"]
    }
  ]
}
```

### `pikku meta functions get <functionId> --json`

Returns full metadata for a specific function.

Response shape:

```json
{
  "functionId": "string",
  "name": "string",
  "description": "string|null",
  "sourceFile": "string|null",
  "inputSchemaName": "string|null",
  "outputSchemaName": "string|null",
  "tags": ["string"],
  "expose": true,
  "readonly": false,
  "input": {
    "name": "string|null",
    "jsonSchema": {}
  },
  "output": {
    "name": "string|null",
    "jsonSchema": {}
  }
}
```

### `pikku meta middleware list --json`

Returns a lightweight index of middleware available for
function/wiring/agent composition.

Response shape:

```json
{
  "middleware": [
    {
      "id": "string",
      "name": "string",
      "description": "string|null"
    }
  ]
}
```

### `pikku meta middleware get <middlewareId> --json`

Returns full metadata for a specific middleware entry.

Response shape:

```json
{
  "middlewareId": "string",
  "name": "string",
  "description": "string|null",
  "scope": ["function", "workflow", "agent"],
  "configSchema": {}
}
```

### `pikku meta permissions list --json`

Returns a lightweight index of permission guards available for
function/wiring/agent composition.

Response shape:

```json
{
  "permissions": [
    {
      "id": "string",
      "name": "string",
      "description": "string|null"
    }
  ]
}
```

### `pikku meta permissions get <permissionId> --json`

Returns full metadata for a specific permission guard.

Response shape:

```json
{
  "permissionId": "string",
  "name": "string",
  "description": "string|null",
  "scope": ["function", "workflow", "agent"],
  "configSchema": {}
}
```

### `pikku meta wires list --json`

Returns available wire categories and counts for quick discovery.

Response shape:

```json
{
  "wireTypes": [
    { "type": "http", "count": 12 },
    { "type": "scheduler", "count": 3 },
    { "type": "queue", "count": 4 },
    { "type": "channel", "count": 2 },
    { "type": "trigger", "count": 1 }
  ]
}
```

### `pikku meta wires <type> --json`

Returns wiring entries for a specific wire type.

Supported `<type>` values:

- `http`
- `scheduler`
- `queue`
- `channel`
- `trigger`

Response shape:

```json
{
  "type": "http",
  "items": [
    {
      "id": "string",
      "functionId": "string",
      "route": "string",
      "method": "string"
    }
  ]
}
```

For non-http types, fields in each `items[]` entry may differ by type
(e.g. `cron`, `queueName`, `channelName`, `eventType`) but MUST always
include `id` and `functionId`.

### `pikku meta workflows list --json`

Returns a lightweight index of workflows.

Response shape:

```json
{
  "workflows": [
    {
      "id": "string",
      "name": "string",
      "description": "string|null"
    }
  ]
}
```

### `pikku meta workflows get <workflowId> --json`

Returns full metadata for a specific workflow.

Response shape:

```json
{
  "workflowId": "string",
  "name": "string",
  "description": "string|null",
  "steps": [],
  "mode": "inline|distributed"
}
```

## Error Contract

On failure:

- exit code != 0
- stderr human-readable
- if `--json` set, stdout MAY include:

```json
{
  "error": {
    "code": "string",
    "message": "string"
  }
}
```

## Stability Rules

- Fields in this contract are append-only for `v1`.
- Breaking changes require explicit versioning (e.g. `meta.v2`).
- Planner agent must treat unknown fields as ignorable.
