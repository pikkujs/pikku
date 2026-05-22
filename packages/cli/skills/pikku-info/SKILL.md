---
name: pikku-info
description: 'Discover what exists in a Pikku project — functions, tags, middleware, permissions, HTTP routes, channels, schedulers, queues, and more. Use when you need to understand the project structure, find existing functions, or check what middleware and permissions are defined.
TRIGGER when: user asks "what functions exist?", "show me the project structure", "list routes/middleware/permissions", or needs to understand an existing Pikku codebase.
DO NOT TRIGGER when: user is writing new code (use the specific wiring skill) or asking about Pikku concepts (use pikku-concepts).'
allowed-tools: Bash(yarn pikku info *)
argument-hint: '[functions|tags|middleware|permissions] [--verbose] [--limit N]'
---

# Pikku Project Discovery

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Use the `pikku info` CLI commands to inspect this Pikku project. Run the commands below and present the results to the user in a clear summary.

## Available Commands

Always use `--silent` to suppress the banner and inspector logs.

### Functions

List all registered pikku functions:

```bash
yarn pikku info functions --silent
```

For full details including transport type (http/channel/scheduler/queue/workflow/mcp/cli/trigger), middleware, permissions, and source file:

```bash
yarn pikku info functions --verbose --silent
```

### Tags

List all tags with counts of associated functions, middleware, and permissions:

```bash
yarn pikku info tags --silent
```

For full names instead of counts:

```bash
yarn pikku info tags --verbose --silent
```

### Middleware

List all middleware definitions:

```bash
yarn pikku info middleware --silent
```

For full details including source file, required services, and description:

```bash
yarn pikku info middleware --verbose --silent
```

### Permissions

List all permission definitions:

```bash
yarn pikku info permissions --silent
```

For full details including source file, required services, and description:

```bash
yarn pikku info permissions --verbose --silent
```

## Instructions

1. If the user specifies a subcommand (e.g., `/pikku-info functions`), run only that command.
2. If no subcommand is specified, run all four commands to give a complete project overview.
3. Always use `--silent` to suppress the Pikku banner and inspector logs.
4. Use `--verbose` when the user asks for details, file paths, or "more info".
5. Use `--limit N` to control output size (default is 50 rows).
6. After running the commands, summarize the findings concisely:
   - Total count of functions, tags, middleware, and permissions
   - Notable patterns (e.g., which transport types are in use, which tags group the most functions)
   - Any functions without tags or transport types (potential issues)
