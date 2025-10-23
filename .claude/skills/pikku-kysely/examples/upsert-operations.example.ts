/**
 * Upsert Operations with ON CONFLICT
 *
 * This example shows how to use PostgreSQL's ON CONFLICT functionality
 * for efficient upsert operations instead of manual conflict detection.
 */

import { pikkuFunc } from '#pikku/pikku-types.gen.js'
import type { Ingredient } from '@pikku-workspace-starter/sdk/.generated/database-types-pure.js'

// ============================================================================
// Basic Upsert with ON CONFLICT DO UPDATE SET
// ============================================================================

type CreateIngredientInput = {
  name: string
  unit: string
  quantityAvailable: number
}

export const createOrUpdateIngredient = pikkuFunc<
  CreateIngredientInput,
  Ingredient
>({
  func: async ({ kysely }, { name, unit, quantityAvailable }) => {
    return await kysely
      .insertInto('ingredient')
      .values({
        name,
        unit,
        quantityAvailable,
      })
      .onConflict('name') // Conflict on name column
      .doUpdateSet({
        unit,
        quantityAvailable,
        updatedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow()
  },
  docs: {
    summary: 'Create or update ingredient',
    description: 'Creates a new ingredient or updates if name already exists',
    tags: ['ingredients'],
  },
})

// ============================================================================
// Upsert with Excluded Values
// ============================================================================

export const upsertIngredient = pikkuFunc<CreateIngredientInput, Ingredient>({
  func: async ({ kysely }, { name, unit, quantityAvailable }) => {
    return await kysely
      .insertInto('ingredient')
      .values({
        name,
        unit,
        quantityAvailable,
      })
      .onConflict('name')
      .doUpdateSet({
        // Use the excluded (new) values explicitly
        unit: (eb) => eb.ref('excluded.unit'),
        quantityAvailable: (eb) => eb.ref('excluded.quantityAvailable'),
        updatedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow()
  },
  docs: {
    summary: 'Upsert ingredient with excluded values',
    tags: ['ingredients'],
  },
})

// ============================================================================
// Conditional Upsert with WHERE Clause
// ============================================================================

export const upsertIngredientIfHigher = pikkuFunc<
  CreateIngredientInput,
  Ingredient
>({
  func: async ({ kysely }, { name, unit, quantityAvailable }) => {
    return await kysely
      .insertInto('ingredient')
      .values({
        name,
        unit,
        quantityAvailable,
      })
      .onConflict('name')
      .doUpdateSet({
        quantityAvailable: (eb) => eb.ref('excluded.quantityAvailable'),
        updatedAt: new Date(),
      })
      // Only update if new quantity is higher
      .where('ingredient.quantityAvailable', '<', (eb) =>
        eb.ref('excluded.quantityAvailable')
      )
      .returningAll()
      .executeTakeFirstOrThrow()
  },
  docs: {
    summary: 'Update ingredient only if new quantity is higher',
    tags: ['ingredients'],
  },
})

// ============================================================================
// ON CONFLICT DO NOTHING
// ============================================================================

export const createIngredientIgnoreConflicts = pikkuFunc<
  CreateIngredientInput[],
  void
>({
  func: async ({ kysely }, ingredients) => {
    await kysely
      .insertInto('ingredient')
      .values(ingredients)
      .onConflict('name')
      .doNothing() // Silently ignore conflicts
      .execute()
  },
  docs: {
    summary: 'Create ingredients, ignore duplicates',
    tags: ['ingredients'],
  },
})

// ============================================================================
// Bulk Upsert
// ============================================================================

export const bulkUpsertIngredients = pikkuFunc<
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
    summary: 'Bulk upsert ingredients',
    tags: ['ingredients'],
  },
})

// ============================================================================
// ANTI-PATTERN (DON'T DO THIS)
// ============================================================================

// ❌ Avoid: Manual conflict detection (race conditions and extra queries)
/*
export const badCreateOrUpdate = pikkuFunc<CreateIngredientInput, Ingredient>({
  func: async ({ kysely }, { name, unit, quantityAvailable }) => {
    // DON'T DO THIS - race condition between these queries!
    const existing = await kysely
      .selectFrom('ingredient')
      .select('ingredientId')
      .where('name', '=', name)
      .executeTakeFirst()

    if (existing) {
      // Update
      return await kysely
        .updateTable('ingredient')
        .set({ unit, quantityAvailable, updatedAt: new Date() })
        .where('ingredientId', '=', existing.ingredientId)
        .returningAll()
        .executeTakeFirstOrThrow()
    } else {
      // Insert
      return await kysely
        .insertInto('ingredient')
        .values({ name, unit, quantityAvailable })
        .returningAll()
        .executeTakeFirstOrThrow()
    }
  }
})
*/
