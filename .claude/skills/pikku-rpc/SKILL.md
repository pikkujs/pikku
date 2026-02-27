---
name: pikku-rpc
description: "Use when making internal function-to-function calls within a Pikku app, composing functions, or exposing RPC endpoints. Covers rpc.invoke, rpc.remote, rpc.exposed, and generated RPC client."
---

# Pikku RPC Wiring

Call Pikku functions from other Pikku functions internally with full type safety. Use RPC to compose business logic without importing functions directly.

## Before You Start

```bash
pikku info functions --verbose   # See existing functions and which could be called via RPC
pikku info tags --verbose        # Understand project organization
```

See `pikku-concepts` for the core mental model.

## API Reference

### RPC Methods (on `wire.rpc`)

Four ways to call functions via RPC:

| Method | Purpose |
|--------|---------|
| `rpc.invoke(name, data)` | Internal call to any wired function |
| `rpc.remote(name, data)` | Remote call via DeploymentService |
| `rpc.exposed(name, data)` | Call functions marked with `expose: true` |
| `rpc.startWorkflow(name, input)` | Start a workflow |

### Exposed Functions

Mark a function as externally callable via RPC:

```typescript
const greet = pikkuSessionlessFunc({
  title: 'Greet',
  expose: true,  // ← callable via rpc.exposed()
  func: async ({}, { name }) => {
    return { message: `Hello, ${name}!` }
  },
})
```

### HTTP RPC Endpoint

Expose all `expose: true` functions over HTTP:

```typescript
wireHTTP({
  route: '/rpc/:rpcName',
  method: 'post',
  auth: false,
  func: rpcCaller,
})
```

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

| Approach | Use When |
|----------|----------|
| `rpc.invoke()` | Cross-domain calls, maintaining separation of concerns, function may be in different package |
| Direct import | Same module, tightly coupled logic, performance critical |

RPC calls go through Pikku's middleware and permission pipeline. Direct imports skip them.

### Generated RPC Client

After `npx pikku prebuild`:

```typescript
import { pikkuRPC } from '.pikku/pikku-rpc.gen.js'

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
