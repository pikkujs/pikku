import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { hasScopes } from '@pikku/core/scope'
import { FEATURES, type FeatureId } from '../lib/features.js'

/**
 * Every key is spelled out rather than built from Object.keys, because this
 * object is what the generated client types. A key the frontend invents then
 * fails to compile instead of arriving as undefined, which reads as false and
 * hides a feature forever while every test stays green.
 */
export const GetFeaturesInput = z.object({})

export const GetFeaturesOutput = z.object({
  catalogueEditor: z.boolean(),
  refundButton: z.boolean(),
  salesReports: z.boolean(),
  orderHistory: z.boolean(),
})

export const getFeatures = pikkuFunc({
  expose: true,
  readonly: true,
  auth: true,
  description:
    'Which features the signed-in shopper may see. UI only, never a gate.',
  input: GetFeaturesInput,
  output: GetFeaturesOutput,
  func: async (_services, _input, { session }) => {
    const can = (feature: FeatureId) =>
      FEATURES[feature].some((scope) => hasScopes([scope], session?.scopes))

    return {
      catalogueEditor: can('catalogueEditor'),
      refundButton: can('refundButton'),
      salesReports: can('salesReports'),
      orderHistory: can('orderHistory'),
    }
  },
})
