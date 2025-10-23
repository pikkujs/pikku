/**
 * Bulk Operations
 *
 * This example shows efficient patterns for handling multiple records
 * in single queries using bulk inserts, updates, and CTEs.
 */

import { pikkuFunc } from '#pikku/pikku-types.gen.js'
import type { Ingredient } from '@pikku-workspace-starter/sdk/.generated/database-types-pure.js'

// ============================================================================
// Bulk Insert with Conflict Resolution
// ============================================================================

type CreateIngredientInput = {
  name: string
  unit: string
  quantityAvailable: number
}

export const bulkCreateIngredients = pikkuFunc<
  CreateIngredientInput[],
  Ingredient[]
>({
  func: async ({ kysely }, ingredients) => {
    return await kysely
      .insertInto('ingredient')
      .values(ingredients)
      .onConflict('name')
      .doUpdateSet({
        unit: (eb) => eb.ref('excluded.unit'),
        quantityAvailable: (eb) => eb.ref('excluded.quantityAvailable'),
        updatedAt: new Date(),
      })
      .returningAll()
      .execute()
  },
  docs: {
    summary: 'Bulk create or update ingredients',
    tags: ['ingredients'],
  },
})

// ============================================================================
// Bulk Updates with CTE
// ============================================================================

type StockUpdate = {
  ingredientId: string
  quantityUsed: number
}

export const bulkUpdateIngredientStock = pikkuFunc<StockUpdate[], void>({
  func: async ({ kysely }, updates) => {
    await kysely
      .with('updates', (db) =>
        db
          .selectFrom(
            kysely
              .values(
                updates.map((u) => ({
                  ingredientId: u.ingredientId,
                  quantityUsed: u.quantityUsed,
                }))
              )
              .as('updates', ['ingredientId', 'quantityUsed'])
          )
          .selectAll()
      )
      .updateTable('ingredient')
      .set({
        quantityAvailable: (eb) =>
          eb(
            'ingredient.quantityAvailable',
            '-',
            eb.ref('updates.quantityUsed')
          ),
        updatedAt: new Date(),
      })
      .from('updates')
      .where('ingredient.ingredientId', '=', (eb) =>
        eb.ref('updates.ingredientId')
      )
      .execute()
  },
  docs: {
    summary: 'Bulk update ingredient stock',
    description: 'Updates multiple ingredients in a single query using CTE',
    tags: ['ingredients'],
  },
})

// ============================================================================
// Bulk Insert with DO NOTHING (Ignore Duplicates)
// ============================================================================

export const bulkCreateIngredientsIgnoreDuplicates = pikkuFunc<
  CreateIngredientInput[],
  void
>({
  func: async ({ kysely }, ingredients) => {
    await kysely
      .insertInto('ingredient')
      .values(ingredients)
      .onConflict('name')
      .doNothing()
      .execute()
  },
  docs: {
    summary: 'Bulk create ingredients, ignore duplicates',
    tags: ['ingredients'],
  },
})

// ============================================================================
// Bulk Delete with IN clause
// ============================================================================

export const bulkDeleteIngredients = pikkuFunc<
  { ingredientIds: string[] },
  void
>({
  func: async ({ kysely }, { ingredientIds }) => {
    await kysely
      .deleteFrom('ingredient')
      .where('ingredientId', 'in', ingredientIds)
      .execute()
  },
  docs: {
    summary: 'Bulk delete ingredients',
    tags: ['ingredients'],
  },
})

// ============================================================================
// Bulk Update with Conditional Logic
// ============================================================================

type PriceUpdate = {
  ingredientId: string
  priceMultiplier: number
}

export const bulkUpdatePrices = pikkuFunc<PriceUpdate[], Ingredient[]>({
  func: async ({ kysely }, updates) => {
    return await kysely
      .with('priceUpdates', (db) =>
        db
          .selectFrom(
            kysely
              .values(
                updates.map((u) => ({
                  ingredientId: u.ingredientId,
                  multiplier: u.priceMultiplier,
                }))
              )
              .as('priceUpdates', ['ingredientId', 'multiplier'])
          )
          .selectAll()
      )
      .updateTable('ingredient')
      .set({
        price: (eb) =>
          eb('ingredient.price', '*', eb.ref('priceUpdates.multiplier')),
        updatedAt: new Date(),
      })
      .from('priceUpdates')
      .where('ingredient.ingredientId', '=', (eb) =>
        eb.ref('priceUpdates.ingredientId')
      )
      .returningAll()
      .execute()
  },
  docs: {
    summary: 'Bulk update ingredient prices',
    tags: ['ingredients'],
  },
})

// ============================================================================
// ANTI-PATTERNS (DON'T DO THIS)
// ============================================================================

// ❌ Avoid: Individual queries in a loop (N+1 problem)
/*
export const badBulkUpdate = pikkuFunc<StockUpdate[], void>({
  func: async ({ kysely }, updates) => {
    // DON'T DO THIS - makes N queries instead of 1!
    for (const update of updates) {
      await kysely
        .updateTable('ingredient')
        .set({
          quantityAvailable: (eb) => eb('quantityAvailable', '-', update.quantityUsed)
        })
        .where('ingredientId', '=', update.ingredientId)
        .execute()
    }
  }
})
*/

// ❌ Avoid: Separate queries for existence checks
/*
export const badBulkInsert = pikkuFunc<CreateIngredientInput[], Ingredient[]>({
  func: async ({ kysely }, ingredients) => {
    const results: Ingredient[] = []

    // DON'T DO THIS - checks each one individually!
    for (const ingredient of ingredients) {
      const existing = await kysely
        .selectFrom('ingredient')
        .select('ingredientId')
        .where('name', '=', ingredient.name)
        .executeTakeFirst()

      if (existing) {
        // update...
      } else {
        // insert...
      }
    }

    return results
  }
})
*/
