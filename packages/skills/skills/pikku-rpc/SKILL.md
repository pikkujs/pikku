---
name: pikku-rpc
description: >-
  Use when making internal function-to-function calls within a Pikku app, composing functions, or
  exposing RPC endpoints. Covers rpc.invoke, rpc.remote, rpc.exposed, and generated RPC client.
  TRIGGER when: code uses wire.rpc or expose: true, user asks about calling one Pikku function
  from another, function composition, or RPC endpoints. DO NOT TRIGGER when: user asks about HTTP
  routes (use pikku-http) or addon cross-package calls (use pikku-addon).
installGroups: [fabric]
---

# Pikku RPC Wiring

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Call Pikku functions from other Pikku functions internally with full type safety. Use RPC to compose business logic without importing functions directly.

## Before You Start

```bash
pikku info functions --verbose   # See existing functions and which could be called via RPC
pikku info tags --verbose        # Understand project organization
```

See `pikku-concepts` for the core mental model.

## API Reference

### RPC Methods (on `wire.rpc`)

| Method                           | Purpose                                   |
| -------------------------------- | ----------------------------------------- |
| `rpc.invoke(name, data)`         | Internal call to any wired function       |
| `rpc.remote(name, data)`         | Remote call via DeploymentService         |
| `rpc.exposed(name, data)`        | Call functions marked with `expose: true` |
| `rpc.startWorkflow(name, input)` | Start a workflow (see `pikku-workflow`)   |
| `rpc.agent.run/stream(...)`      | Run an AI agent (see `pikku-agent`)       |
| `rpc.agent.resume/approve(...)`  | Answer a tool-approval interrupt          |
| `rpc.agent.interrupt(runId)`     | Stop an in-flight run                     |

`rpc.invoke`, `rpc.remote` and `rpc.startWorkflow` are typed off the generated
RPC map, so the name and the payload are checked. `rpc.exposed` is deliberately
`(name: string, data: any) => Promise<any>` — it exists to dispatch a name that
arrived from outside, which by definition cannot be checked at compile time.
Reach for `rpc.invoke` whenever the name is known statically.

`rpc` also carries `depth` (how deep the current RPC chain is, so runaway
recursion is visible) and `global`.

### Exposed Functions

Mark a function as externally callable via RPC:

```typescript
const greet = pikkuSessionlessFunc({
  title: 'Greet',
  expose: true, // ← callable via rpc.exposed()
  func: async ({}, { name }) => {
    return { message: `Hello, ${name}!` }
  },
})
```

### HTTP RPC Endpoint

The `POST /rpc/:rpcName` endpoint that dispatches every `expose: true` function
is **generated, not hand-written**. Turn it on and let codegen own it:

```bash
pikku enable rpc            # sets scaffold.rpc = true
```

The flag says the endpoint exists, not who may call it — each exposed function
is gated by its own `auth`, permissions and scopes.

This writes `rpc-public.gen.ts` with an `rpcCaller` function and its `wireHTTP`
call already wired. Do not write that wiring yourself — a hand-rolled copy
collides with the generated route on the same path.

## Usage Patterns

### Internal Function Composition

```typescript
const calculateTax = pikkuSessionlessFunc({
  title: 'Calculate Tax',
  func: async ({}, { amount, rate }) => {
    return { tax: amount * rate }
  },
})

const processOrder = pikkuFunc({
  title: 'Process Order',
  func: async ({ db }, { orderId }, { rpc }) => {
    const order = await db.getOrder(orderId)

    // Call another pikku function internally — fully typed
    const { tax } = await rpc.invoke('calculateTax', {
      amount: order.total,
      rate: 0.08,
    })

    return { orderId, total: order.total + tax }
  },
})
```

### When to Use RPC vs Direct Imports

| Approach       | Use When                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------- |
| `rpc.invoke()` | Cross-domain calls, maintaining separation of concerns, function may be in different package |
| Direct import  | Same module, tightly coupled logic, performance critical                                     |

RPC calls go through Pikku's middleware and permission pipeline. Direct imports skip them.

### Generated RPC Client

After `npx pikku all`:

```typescript
import { pikkuRPC } from '#pikku/pikku-rpc.gen.js'

pikkuRPC.setServerUrl('http://localhost:4002')

const result = await pikkuRPC.invoke('calculateTax', {
  amount: 100,
  rate: 0.08,
})

pikkuRPC.setAuthorizationJWT(token)
```

## Complete Example

```typescript
// functions/billing.functions.ts
export const calculateTax = pikkuSessionlessFunc({
  title: 'Calculate Tax',
  func: async ({}, { amount, region }) => {
    const rates = { US: 0.08, EU: 0.2, UK: 0.2 }
    return { tax: amount * (rates[region] || 0) }
  },
})

export const calculateShipping = pikkuSessionlessFunc({
  title: 'Calculate Shipping',
  func: async ({}, { weight, region }) => {
    const base = region === 'US' ? 5 : 15
    return { shipping: base + weight * 0.5 }
  },
})

// functions/orders.functions.ts
export const processOrder = pikkuFunc({
  title: 'Process Order',
  func: async ({ db }, { orderId }, { rpc }) => {
    const order = await db.getOrder(orderId)

    const { tax } = await rpc.invoke('calculateTax', {
      amount: order.total,
      region: order.region,
    })

    const { shipping } = await rpc.invoke('calculateShipping', {
      weight: order.totalWeight,
      region: order.region,
    })

    const finalTotal = order.total + tax + shipping
    await db.updateOrder(orderId, { tax, shipping, finalTotal })

    return { orderId, total: finalTotal, tax, shipping }
  },
})
```
