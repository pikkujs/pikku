---
'@pikku/console': patch
---

Export the console as panels, not just screens.

Every page that mounted its own `PanelProvider` had to keep its table in a private
inner component so `usePanelContext` had a provider above it. Those tables are now
standalone panels a host can mount and arrange itself:

- `ConsoleSurface` mounts the panel context (deferring to a host's own, unless
  `isolate` is passed), and `ConsoleInspectorPanel` renders the detail pane for
  whatever is selected — entity-agnostic, so one inspector pairs with any list.
- `TabbedSurface` for the pages that are a tab strip over several panels.
- List panels for HTTP, MCP, queues, schedulers, triggers, middleware, permissions,
  services, webhooks, auth providers, variables, secrets, functions, packages, users,
  agents, email templates, scenario flows and personas, plus the security report and
  audit log.
- The agent playground as `AgentPlaygroundSurface` with its conversations, chat and
  selector panels.
- The data hooks behind each panel (`useHttpItems`, `useQueueItems`, `useAgentItems`,
  `useAdminUsers`, …) and their item types.

Purely additive: every page keeps its existing prop surface and renders identically.
