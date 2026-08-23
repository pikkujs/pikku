---
name: pikku-meta
description: >-
  Read and change a Pikku project's declarations without grepping or hand-editing — functions
  (with their transport, middleware and permissions), schemas, workflows, wires, tags, middleware
  and permission definitions, plus `pikku meta apply` to set config on them. TRIGGER when: user
  asks "what functions exist?", "show me the project structure", "list routes/middleware/
  permissions", needs a function's input/output shape, or wants to add a permission, retag a
  function, or change a declaration's config. DO NOT TRIGGER when: user is writing a NEW function
  or wiring (use the specific wiring skill) or asking about Pikku concepts (use pikku-concepts).
installGroups: [core]
allowed-tools: Bash(yarn pikku meta *), Bash(yarn pikku info *)
argument-hint: '[context|functions|schemas|workflows|middleware|permissions|wires|apply]'
---

# Pikku Project Metadata

`pikku meta` is the machine-readable view of the project and the write path to it.
`pikku info` is the same ground as human-readable tables. Prefer `meta` when you are
going to act on the output; prefer `info` when a person is going to read it.

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Change a declaration's config with `pikku meta apply`, not by hand-editing the file.
4. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
5. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
6. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

## Reading

| Command                         | What it answers                                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `pikku meta context`            | Everything a planner needs in one call — functions, wires, middleware, permissions, workflows, capabilities, layout. Start here. |
| `pikku meta functions get <id>` | One function's input/output schema names, source file, tags, expose/readonly                                                     |
| `pikku meta schemas get <name>` | One generated JSON schema                                                                                                        |
| `pikku meta workflows get <id>` | One workflow's steps                                                                                                             |
| `pikku meta permissions list`   | What permissions exist and where they are defined                                                                                |
| `pikku meta middleware list`    | What middleware exists                                                                                                           |
| `pikku meta wires list`         | Wires by transport (http, channel, scheduler, queue, trigger)                                                                    |
| `pikku meta clients`            | Exposed RPCs/workflows/channels with their type names — what a frontend can call                                                 |

`list` is the default for each group, so `pikku meta functions` and `pikku meta functions list`
are the same call.

A function's input/output shape comes from here. Do not infer it by reading the
function body, and do not cast a call site to make it compile — the schema is the type.

## Changing

`pikku meta apply` applies a batch of edits to your own source. Pass JSON as a file
or on stdin:

```bash
pikku meta apply ops.json
```

```json
{
  "operations": [
    {
      "kind": "functionConfig",
      "sourceFile": "src/functions/todos.functions.ts",
      "exportedName": "listTodos",
      "changes": { "title": "List Todos", "tags": ["todos", "read"] }
    },

    {
      "kind": "functionConfig",
      "sourceFile": "src/functions/todos.functions.ts",
      "exportedName": "listTodos",
      "changes": {
        "permissions": {
          "functionLevel": {
            "name": "isTodoOwner",
            "from": "../permissions.js"
          }
        }
      }
    }
  ]
}
```

Three kinds: `functionConfig`, `agentConfig`, `functionBody`. Every operation names
a `sourceFile` and the `exportedName` declared in it.

`functionConfig` changes: `title`, `description`, `summary`, `tags`, `errors`,
`expose`, `remote`, `mcp`, `readonly`, `approvalRequired`, `permissions`.
`agentConfig` changes: `name`, `description`, `instructions`, `role`, `personality`,
`goal`, `model`, `maxSteps`, `temperature`, `toolChoice`, `tools`, `tags`.

`null` removes a property. Edits are spliced into the original text, so formatting,
comments and JSDoc survive.

`permissions` and `tools` are written as identifiers rather than literals, so each
one carries the module it comes from (`{"name": "isTodoOwner", "from": "../permissions.js"}`)
and the missing import is added for you — widening an existing import from that
module rather than adding a second one.

### Why batch

The whole batch either lands or it does not: every operation is resolved before
anything is written, so a failure leaves every file untouched and names the
operation that caused it. Batching is also what makes one codegen pass correct —
**run `pikku all` once after the batch**, not once per property. The response tells
you whether it is needed:

```json
{
  "schemaVersion": "meta-apply.v1",
  "applied": 2,
  "files": ["src/functions/todos.functions.ts"],
  "generatedMetaIsStale": true
}
```

## Human-readable tables (`pikku info`)

Four subcommands only — `functions`, `tags`, `middleware`, `permissions`. Routes,
channels, schedulers and queues are not subcommands; they are the _transport_ column
of `info functions --verbose`.

```bash
yarn pikku info functions --verbose --silent
yarn pikku info tags --silent
yarn pikku info middleware --verbose --silent
yarn pikku info permissions --verbose --silent
```

`--silent` suppresses the banner and inspector diagnostics. It works, but it is not
declared as an option, so every run also prints `Warning: Unknown option: --silent
(ignored)` — the warning is wrong. Ignore that one line.

`--limit N` caps rows (default 50); the footer says how many were withheld.
On `tags`, `--verbose` swaps counts for names; elsewhere it adds columns.
