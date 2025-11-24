# External Package Structure

This document defines the structure and requirements for Pikku external packages.

## Package Directory Structure

```
@acme/stripe-functions/
├── package.json
├── README.md
├── src/
│   ├── index.ts                    # Main entry point
│   ├── types.ts                    # Type definitions
│   ├── config.ts                   # createConfig()
│   ├── services.ts                 # createSingletonServices(), createWireServices()
│   └── functions/
│       ├── create-charge.functions.ts
│       ├── refund-charge.functions.ts
│       └── ...
├── .pikku/                         # Pre-built metadata (published with package)
│   ├── pikku-metadata.gen.json     # Function metadata
│   ├── pikku-types.gen.ts          # Generated types
│   └── pikku-bootstrap.gen.ts      # Package bootstrap
└── dist/                           # Built output
    ├── index.js
    ├── index.d.ts
    └── ...
```

## Required Files

### 1. `package.json`

Standard npm package.json with proper exports:

```json
{
  "name": "@acme/stripe-functions",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./types": {
      "types": "./dist/types.d.ts",
      "import": "./dist/types.js"
    },
    "./.pikku/pikku-bootstrap.gen.js": "./.pikku/pikku-bootstrap.gen.js",
    "./.pikku/pikku-metadata.gen.json": "./.pikku/pikku-metadata.gen.json"
  },
  "files": ["dist", ".pikku"],
  "peerDependencies": {
    "@pikku/core": "^1.0.0"
  }
}
```

### 2. `src/config.ts`

Package configuration factory:

```typescript
import type { CreatePackageConfig, PackageConfig } from '@pikku/core'

export interface StripeConfig extends PackageConfig {
  stripeApiKey: string
  stripeWebhookSecret?: string
}

export const createConfig: CreatePackageConfig<StripeConfig> = (
  parentConfig
) => {
  return {
    stripeApiKey: parentConfig.STRIPE_API_KEY || process.env.STRIPE_API_KEY,
    stripeWebhookSecret:
      parentConfig.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET,
  }
}
```

### 3. `src/services.ts`

Service factory functions:

```typescript
import Stripe from 'stripe'
import type {
  CreatePackageSingletonServices,
  CreatePackageWireServices,
  CoreSingletonServices,
} from '@pikku/core'
import type { StripeConfig } from './config.js'

export interface StripeSingletonServices {
  // Hydrated from parent (always reuse)
  logger: CoreSingletonServices['logger']
  variables: CoreSingletonServices['variables']
  schema: CoreSingletonServices['schema']
  config: CoreSingletonServices['config']

  // Hydrated from parent if available (conditional reuse)
  db?: CoreSingletonServices['db']
  redis?: CoreSingletonServices['redis']

  // Package-specific (never hydrated)
  stripe: Stripe
}

export interface StripeWireServices {
  // Per-request services (if needed)
  requestId: string
}

export const createSingletonServices: CreatePackageSingletonServices<
  StripeConfig,
  StripeSingletonServices
> = async (config, parentServices) => {
  return {
    // ALWAYS reuse from parent
    logger: parentServices.logger,
    variables: parentServices.variables,
    schema: parentServices.schema,
    config: parentServices.config,

    // CONDITIONALLY reuse from parent
    db: parentServices.db,
    redis: parentServices.redis,

    // ALWAYS create own
    stripe: new Stripe(config.stripeApiKey, {
      apiVersion: '2023-10-16',
      typescript: true,
    }),
  }
}

export const createWireServices: CreatePackageWireServices<
  StripeSingletonServices,
  StripeWireServices
> = async (singletons) => {
  return {
    requestId: `req-${Date.now()}`,
  }
}
```

### 4. `src/index.ts`

Main export file:

```typescript
export { createConfig } from './config.js'
export { createSingletonServices, createWireServices } from './services.js'
export type { StripeConfig } from './config.js'
export type { StripeSingletonServices, StripeWireServices } from './services.js'

// Re-export function types for type-safe RPC calls
export type * from './types.js'
```

### 5. `src/types.ts`

Type-only exports for consuming applications:

```typescript
// Input/output types for each function
export type CreateChargeInput = {
  amount: number
  currency: string
  description?: string
}

export type CreateChargeOutput = {
  id: string
  amount: number
  status: string
  created: number
}

export type RefundChargeInput = {
  chargeId: string
  amount?: number
}

export type RefundChargeOutput = {
  id: string
  amount: number
  status: string
}
```

### 6. `src/functions/*.functions.ts`

Function definitions using Pikku function types:

```typescript
import { pikkuSessionlessFunc } from '@pikku/core'
import type { CreateChargeInput, CreateChargeOutput } from '../types.js'
import type { StripeSingletonServices } from '../services.js'

export const createCharge = pikkuSessionlessFunc<
  CreateChargeInput,
  CreateChargeOutput,
  StripeSingletonServices
>(async ({ stripe, logger }, data) => {
  logger.info(`Creating charge for ${data.amount} ${data.currency}`)

  const charge = await stripe.charges.create({
    amount: data.amount,
    currency: data.currency,
    description: data.description,
  })

  return {
    id: charge.id,
    amount: charge.amount,
    status: charge.status,
    created: charge.created,
  }
})
```

### 7. `.pikku/pikku-bootstrap.gen.ts` (Generated)

Auto-generated bootstrap file that registers the package:

```typescript
import { packageLoader } from '@pikku/core'
import { createConfig } from '../dist/config.js'
import {
  createSingletonServices,
  createWireServices,
} from '../dist/services.js'
import metadata from './pikku-metadata.gen.json' assert { type: 'json' }

// Self-register on import
packageLoader.register({
  name: '@acme/stripe-functions',
  metadata,
  createConfig,
  createSingletonServices,
  createWireServices,
})
```

### 8. `.pikku/pikku-metadata.gen.json` (Generated)

Pre-built function metadata:

```json
{
  "name": "@acme/stripe-functions",
  "version": "1.0.0",
  "functions": {
    "createCharge": {
      "name": "createCharge",
      "type": "sessionless",
      "expose": false,
      "sourceFile": "src/functions/create-charge.functions.ts",
      ...
    }
  }
}
```

## Usage in Main Application

### 1. Configuration (`pikku.config.json`)

```json
{
  "externalPackages": {
    "stripe": "@acme/stripe-functions",
    "twilio": "@acme/twilio-functions"
  }
}
```

### 2. Calling Functions

```typescript
import { pikkuSessionlessFunc } from '@pikku/core'
import type {
  CreateChargeInput,
  CreateChargeOutput,
} from '@acme/stripe-functions/types'

export const processPayment = pikkuSessionlessFunc<
  { orderId: string; amount: number },
  { chargeId: string }
>(async ({}, data, { rpc }) => {
  // Type-safe RPC call to external package
  const charge = await rpc.invoke<CreateChargeInput, CreateChargeOutput>(
    'stripe:createCharge',
    {
      amount: data.amount,
      currency: 'usd',
    }
  )

  return { chargeId: charge.id }
})
```

## Build Process

1. **Development**: Write functions in `src/functions/*.functions.ts`
2. **Inspection**: Run `pikku all` to generate metadata in `.pikku/`
3. **Build**: Compile TypeScript to `dist/`
4. **Publish**: Publish package with both `dist/` and `.pikku/` directories

## Type Safety

External packages provide full type safety with zero runtime overhead through `import type` statements.

### Type-Only Imports

TypeScript's `import type` ensures that type information is available during development but is completely eliminated from the runtime bundle:

```typescript
import type {
  CreateChargeInput,
  CreateChargeOutput,
} from '@acme/stripe-functions/types'
```

This import:

- Provides full TypeScript autocomplete and type checking
- Is completely removed by the TypeScript compiler
- Adds zero bytes to your bundle
- Works even if the package is not installed (for type checking only)

### Generic Type Parameters

Use generic type parameters with `rpc.invoke` for type-safe calls:

```typescript
const result = await rpc.invoke<CreateChargeInput, CreateChargeOutput>(
  'stripe:createCharge',
  { amount: 100, currency: 'usd' }
)
```

TypeScript will:

- Validate the input data matches `CreateChargeInput`
- Infer the return type as `CreateChargeOutput`
- Catch type mismatches at compile time

## Tree Shaking

- **Package-level**: Unused packages are not imported in the generated bootstrap
- **Inspector detection**: Scans for `rpc.invoke('namespace:...')` calls
- **Conditional imports**: Only detected packages are added to bootstrap file
- **Type-only imports**: Use `import type` for zero runtime overhead

## Service Hydration

Packages can choose which parent services to reuse:

- **Always hydrate**: Logger, variables, schema, config (no duplication)
- **Conditional hydrate**: DB, Redis (reuse if parent has it)
- **Never hydrate**: Package-specific SDKs like Stripe, Twilio (always create own)

This prevents resource duplication while allowing package isolation.
