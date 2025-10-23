/**
 * Atomic Operations
 *
 * This example shows how to use database-level atomic operations for
 * increment/decrement to avoid race conditions.
 */

import { pikkuFunc } from '#pikku/pikku-types.gen.js'
import { NotFoundError } from '@pikku/core/errors'
import type { Ingredient } from '@pikku-workspace-starter/sdk/.generated/database-types-pure.js'

// ============================================================================
// Atomic Increment/Decrement
// ============================================================================

export const updateIngredientStock = pikkuFunc<
  { ingredientId: string; delta: number },
  Ingredient
>({
  func: async ({ kysely }, { ingredientId, delta }) => {
    return await kysely
      .updateTable('ingredient')
      .set({
        quantityAvailable: (eb) => eb('quantityAvailable', '+', delta),
        updatedAt: new Date(),
      })
      .where('ingredientId', '=', ingredientId)
      .returningAll()
      .executeTakeFirstOrThrow(() => new NotFoundError('Ingredient not found'))
  },
  docs: {
    summary: 'Update ingredient stock atomically',
    description: 'Increments or decrements stock by delta amount',
    tags: ['ingredients'],
    errors: ['NotFoundError'],
  },
})

// ============================================================================
// Atomic Increment with Constraints
// ============================================================================

export const decrementStockSafely = pikkuFunc<
  { ingredientId: string; amount: number },
  Ingredient
>({
  func: async ({ kysely }, { ingredientId, amount }) => {
    return await kysely
      .updateTable('ingredient')
      .set({
        quantityAvailable: (eb) => eb('quantityAvailable', '-', amount),
        updatedAt: new Date(),
      })
      .where('ingredientId', '=', ingredientId)
      // Ensure we don't go negative
      .where('quantityAvailable', '>=', amount)
      .returningAll()
      .executeTakeFirstOrThrow(
        () => new NotFoundError('Insufficient stock or ingredient not found')
      )
  },
  docs: {
    summary: 'Decrement stock with safety check',
    description: 'Only decrements if sufficient stock is available',
    tags: ['ingredients'],
    errors: ['NotFoundError'],
  },
})

// ============================================================================
// Atomic Update with Multiple Fields
// ============================================================================

export const processIngredientUsage = pikkuFunc<
  { ingredientId: string; quantityUsed: number; cost: number },
  Ingredient
>({
  func: async ({ kysely }, { ingredientId, quantityUsed, cost }) => {
    return await kysely
      .updateTable('ingredient')
      .set({
        quantityAvailable: (eb) => eb('quantityAvailable', '-', quantityUsed),
        totalCost: (eb) => eb('totalCost', '+', cost),
        usageCount: (eb) => eb('usageCount', '+', 1),
        updatedAt: new Date(),
      })
      .where('ingredientId', '=', ingredientId)
      .where('quantityAvailable', '>=', quantityUsed)
      .returningAll()
      .executeTakeFirstOrThrow(() => new NotFoundError('Insufficient stock'))
  },
  docs: {
    summary: 'Process ingredient usage atomically',
    tags: ['ingredients'],
    errors: ['NotFoundError'],
  },
})

// ============================================================================
// Conditional Atomic Update
// ============================================================================

export const incrementStockIfLow = pikkuFunc<
  { ingredientId: string; amount: number; threshold: number },
  Ingredient | null
>({
  func: async ({ kysely }, { ingredientId, amount, threshold }) => {
    return await kysely
      .updateTable('ingredient')
      .set({
        quantityAvailable: (eb) => eb('quantityAvailable', '+', amount),
        updatedAt: new Date(),
      })
      .where('ingredientId', '=', ingredientId)
      // Only increment if below threshold
      .where('quantityAvailable', '<', threshold)
      .returningAll()
      .executeTakeFirst() // May return null if condition not met
  },
  docs: {
    summary: 'Increment stock only if below threshold',
    description: 'Returns null if stock is already above threshold',
    tags: ['ingredients'],
  },
})

// ============================================================================
// ANTI-PATTERN (DON'T DO THIS)
// ============================================================================

// ❌ Avoid: Read-modify-write pattern (race conditions!)
/*
export const badUpdateStock = pikkuFunc<
  { ingredientId: string; delta: number },
  Ingredient
>({
  func: async ({ kysely }, { ingredientId, delta }) => {
    // DON'T DO THIS - race condition between these operations!
    const ingredient = await kysely
      .selectFrom('ingredient')
      .select('quantityAvailable')
      .where('ingredientId', '=', ingredientId)
      .executeTakeFirstOrThrow()

    // If another request modifies the quantity here, we lose that update!
    return await kysely
      .updateTable('ingredient')
      .set({
        quantityAvailable: ingredient.quantityAvailable + delta,
        updatedAt: new Date()
      })
      .where('ingredientId', '=', ingredientId)
      .returningAll()
      .executeTakeFirstOrThrow()
  }
})
*/

// ❌ Avoid: Application-level locks
/*
let isProcessing = false

export const badLocking = pikkuFunc<{ ingredientId: string; delta: number }, Ingredient>({
  func: async ({ kysely }, { ingredientId, delta }) => {
    if (isProcessing) {
      throw new Error('Already processing')
    }
    isProcessing = true

    try {
      // ... update logic
    } finally {
      isProcessing = false
    }
  }
})
*/
