---
type: decision
title: Bare workflow names from inside an addon are prefixed with the consumer's namespace
description: The addon's workflowService is proxied so an addon never has to hardcode the name its consumer chose
tags: rpc
---

# Bare workflow names from inside an addon are prefixed with the consumer's namespace

`wrapWorkflowServiceForPackage` in
`packages/core/src/wirings/rpc/addon-runner.ts` proxies an addon package's
`workflowService`, intercepting `startWorkflow` and `runToCompletion`. A bare
name — one with no `:` — is rewritten to `${namespace}:${name}`, using the
instance namespace when known and otherwise the package's sole namespace via
`findAddonNamespaceForPackage`.

Workflows declared by an addon are registered under the addon's package scope,
but the namespace they answer to is chosen by the _consumer_ in `wireAddon`.
Without the proxy, `runToCompletion('myWorkflow')` written inside the addon
resolves against root meta, misses, and throws `WorkflowNotFoundError` — leaving
the addon author no option but to hardcode the consumer-defined namespace, which
couples a reusable package to one particular caller. Explicit `'ns:name'` calls
and bare names that already resolve in root are untouched; only bare names that
would otherwise miss get prefixed.

**What this rules out:** dropping the proxy and requiring addons to namespace
their own workflow calls, and widening the rewrite to names that already contain
a `:` or already exist at root — either turns a working call into a lookup miss.
