/**
 * Transaction Best Practices
 *
 * This example shows how to use transactions for multi-table operations
 * that must succeed or fail together.
 */

import { pikkuFunc } from '#pikku/pikku-types.gen.js'
import { BadRequestError, ConflictError } from '@pikku/core/errors'
import type { Order } from '@pikku-workspace-starter/sdk/.generated/database-types-pure.js'

// ============================================================================
// Multi-table Transaction with Stock Management
// ============================================================================

export const acceptOrderWithStockUpdate = pikkuFunc<{ orderId: string }, Order>(
  {
    func: async ({ kysely }, { orderId }, session) => {
      return await kysely.transaction().execute(async (trx) => {
        // Get order items with required ingredients
        const orderItems = await trx
          .selectFrom('orderItem')
          .innerJoin(
            'dishIngredient',
            'dishIngredient.dishId',
            'orderItem.dishId'
          )
          .select([
            'dishIngredient.ingredientId',
            'dishIngredient.quantityNeeded',
            'orderItem.quantity',
          ])
          .where('orderItem.orderId', '=', orderId)
          .execute()

        // Update ingredient stock atomically
        for (const item of orderItems) {
          const totalUsed = item.quantityNeeded * item.quantity

          const result = await trx
            .updateTable('ingredient')
            .set({
              quantityAvailable: (eb) =>
                eb('quantityAvailable', '-', totalUsed),
              updatedAt: new Date(),
            })
            .where('ingredientId', '=', item.ingredientId)
            .where('quantityAvailable', '>=', totalUsed)
            .executeTakeFirst()

          if (result.numUpdatedRows === 0n) {
            throw new BadRequestError(
              `Insufficient stock for ingredient ${item.ingredientId}`
            )
          }
        }

        // Update order status
        return await trx
          .updateTable('order')
          .set({
            cookId: session?.userId,
            status: 'accepted',
            acceptedAt: new Date(),
            updatedAt: new Date(),
          })
          .where('orderId', '=', orderId)
          .where('status', '=', 'pending')
          .returningAll()
          .executeTakeFirstOrThrow(
            () => new ConflictError('Order is no longer pending')
          )
      })
    },
    docs: {
      summary: 'Accept order and update stock',
      description:
        'Transaction ensures stock is updated only if order can be accepted',
      tags: ['orders'],
      errors: ['BadRequestError', 'ConflictError'],
    },
  }
)

// ============================================================================
// Transaction with Multiple Inserts
// ============================================================================

type CreateDishWithIngredientsInput = {
  name: string
  description: string
  price: number
  ingredients: Array<{
    ingredientId: string
    quantityNeeded: number
  }>
}

export const createDishWithIngredients = pikkuFunc<
  CreateDishWithIngredientsInput,
  { dishId: string }
>({
  func: async ({ kysely }, { name, description, price, ingredients }) => {
    return await kysely.transaction().execute(async (trx) => {
      // Insert dish
      const dish = await trx
        .insertInto('dish')
        .values({ name, description, price })
        .returning(['dishId'])
        .executeTakeFirstOrThrow()

      // Insert dish-ingredient relationships
      await trx
        .insertInto('dishIngredient')
        .values(
          ingredients.map((ing) => ({
            dishId: dish.dishId,
            ingredientId: ing.ingredientId,
            quantityNeeded: ing.quantityNeeded,
          }))
        )
        .execute()

      return dish
    })
  },
  docs: {
    summary: 'Create dish with ingredients',
    description: 'Creates dish and relationships in a single transaction',
    tags: ['dishes'],
  },
})

// ============================================================================
// Transaction with Rollback on Business Logic
// ============================================================================

export const transferStock = pikkuFunc<
  { fromIngredientId: string; toIngredientId: string; amount: number },
  void
>({
  func: async ({ kysely }, { fromIngredientId, toIngredientId, amount }) => {
    await kysely.transaction().execute(async (trx) => {
      // Decrement from source
      const source = await trx
        .updateTable('ingredient')
        .set({
          quantityAvailable: (eb) => eb('quantityAvailable', '-', amount),
          updatedAt: new Date(),
        })
        .where('ingredientId', '=', fromIngredientId)
        .where('quantityAvailable', '>=', amount)
        .executeTakeFirst()

      if (source.numUpdatedRows === 0n) {
        throw new BadRequestError('Insufficient stock in source ingredient')
      }

      // Increment target
      const target = await trx
        .updateTable('ingredient')
        .set({
          quantityAvailable: (eb) => eb('quantityAvailable', '+', amount),
          updatedAt: new Date(),
        })
        .where('ingredientId', '=', toIngredientId)
        .executeTakeFirst()

      if (target.numUpdatedRows === 0n) {
        throw new BadRequestError('Target ingredient not found')
      }
    })
  },
  docs: {
    summary: 'Transfer stock between ingredients',
    description: 'Atomic transfer - both succeed or both fail',
    tags: ['ingredients'],
    errors: ['BadRequestError'],
  },
})

// ============================================================================
// Transaction with Conditional Logic
// ============================================================================

export const completeOrderWithRefund = pikkuFunc<
  { orderId: string; refundAmount?: number },
  Order
>({
  func: async ({ kysely }, { orderId, refundAmount }) => {
    return await kysely.transaction().execute(async (trx) => {
      // Mark order as delivered
      const order = await trx
        .updateTable('order')
        .set({
          status: 'delivered',
          deliveredAt: new Date(),
          updatedAt: new Date(),
        })
        .where('orderId', '=', orderId)
        .returningAll()
        .executeTakeFirstOrThrow(() => new ConflictError('Order not found'))

      // Apply refund if specified
      if (refundAmount && refundAmount > 0) {
        await trx
          .insertInto('refund')
          .values({
            orderId,
            amount: refundAmount,
            reason: 'Partial delivery issue',
          })
          .execute()

        // Update order total
        await trx
          .updateTable('order')
          .set({
            totalAmount: (eb) => eb('totalAmount', '-', refundAmount),
          })
          .where('orderId', '=', orderId)
          .execute()
      }

      return order
    })
  },
  docs: {
    summary: 'Complete order with optional refund',
    tags: ['orders'],
    errors: ['ConflictError'],
  },
})

// ============================================================================
// ANTI-PATTERNS (DON'T DO THIS)
// ============================================================================

// ❌ Avoid: Not using transactions for multi-table operations
/*
export const badMultiTableUpdate = pikkuFunc<{ orderId: string }, Order>({
  func: async ({ kysely }, { orderId }) => {
    // DON'T DO THIS - if the second update fails, the first is already committed!
    await kysely
      .updateTable('ingredient')
      .set({ quantityAvailable: (eb) => eb('quantityAvailable', '-', 10) })
      .where('ingredientId', '=', 'some-id')
      .execute()

    // If this fails, the ingredient update is already saved!
    return await kysely
      .updateTable('order')
      .set({ status: 'accepted' })
      .where('orderId', '=', orderId)
      .returningAll()
      .executeTakeFirstOrThrow()
  }
})
*/

// ❌ Avoid: Nested transactions (not supported)
/*
export const badNestedTransaction = pikkuFunc<{ orderId: string }, Order>({
  func: async ({ kysely }, { orderId }) => {
    return await kysely.transaction().execute(async (trx1) => {
      // DON'T DO THIS - nested transactions not supported!
      return await trx1.transaction().execute(async (trx2) => {
        // ...
      })
    })
  }
})
*/
