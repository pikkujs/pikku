---
name: pikku-info
description: Discover what exists in a Pikku project — functions, tags, middleware, permissions, HTTP routes, channels, schedulers, queues, and more. Use when you need to understand the project structure, find existing functions, or check what middleware and permissions are defined.
allowed-tools: Bash(yarn pikku info *)
argument-hint: '[functions|tags|middleware|permissions] [--verbose] [--limit N]'
---

# Pikku Project Discovery

Use the `pikku info` CLI commands to inspect this Pikku project. Run the commands below and present the results to the user in a clear summary.

## Available Commands

Always use `--silent` to suppress the banner and inspector logs.

### Functions

List all registered pikku functions:

```
yarn pikku info functions --silent
```

For full details including transport type (http/channel/scheduler/queue/workflow/mcp/cli/trigger), middleware, permissions, and source file:

```
yarn pikku info functions --verbose --silent
```

### Tags

List all tags with counts of associated functions, middleware, and permissions:

```
yarn pikku info tags --silent
```

For full names instead of counts:

```
yarn pikku info tags --verbose --silent
```

### Middleware

List all middleware definitions:

```
yarn pikku info middleware --silent
```

For full details including source file, required services, and description:

```
yarn pikku info middleware --verbose --silent
```

### Permissions

List all permission definitions:

```
yarn pikku info permissions --silent
```

For full details including source file, required services, and description:

```
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
