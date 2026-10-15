import { z } from 'zod'
import { defineVariable } from '#pikku/variables/pikku-variable-types.gen.js'

// @snippet start variables
export const DatabaseUrlSchema = z.string()
export const LowStockThresholdSchema = z.number().int().positive()
export const VirtualUserVerifyKeySchema = z.string()
export const BetterAuthUrlSchema = z.string().url()

defineVariable({
  name: 'databaseUrl',
  displayName: 'Database URL',
  description: 'Primary database connection string (Postgres or libsql URL)',
  variableId: 'DATABASE_URL',
  schema: DatabaseUrlSchema,
})

defineVariable({
  name: 'lowStockThreshold',
  displayName: 'Low Stock Threshold',
  description: 'Item stock level that triggers a low-stock alert',
  variableId: 'LOW_STOCK_THRESHOLD',
  schema: LowStockThresholdSchema,
})

defineVariable({
  name: 'virtualUserVerifyKey',
  displayName: 'Virtual User Verify Key',
  description:
    'Public key that checks the signed statements `pikku scenario run` presents. Leave unset to refuse virtual user sign-in from outside the app',
  variableId: 'VIRTUAL_USER_VERIFY_KEY',
  schema: VirtualUserVerifyKeySchema,
  optional: true,
})

defineVariable({
  name: 'betterAuthUrl',
  displayName: 'Better Auth Base URL',
  description:
    'Public origin the API is served from, used for auth callbacks and redirects',
  variableId: 'BETTER_AUTH_URL',
  schema: BetterAuthUrlSchema,
})
// @snippet end variables

export const WarehouseFeedUrlSchema = z.string().url()

defineVariable({
  name: 'warehouseFeedUrl',
  displayName: 'Warehouse Feed URL',
  description:
    'Server-sent-events endpoint the warehouse pushes stock movements to',
  variableId: 'WAREHOUSE_FEED_URL',
  schema: WarehouseFeedUrlSchema,
})
