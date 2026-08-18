/**
 * Shipment Functions
 *
 * Mock implementations shaped for graph fan-out: one function returns a
 * collection, one runs per element, one folds the per-element results back up.
 */

import { pikkuSessionlessFunc } from '#pikku/function'

export const shipmentList = pikkuSessionlessFunc<
  { orderId: string },
  { shipments: Array<{ shipmentId: string; weightKg: number }> }
>({
  title: 'List Shipments',
  func: async ({ logger }, data) => {
    logger.info(`Listing shipments for order: ${data.orderId}`)
    return {
      shipments: [
        { shipmentId: `${data.orderId}-a`, weightKg: 1 },
        { shipmentId: `${data.orderId}-b`, weightKg: 2 },
        { shipmentId: `${data.orderId}-c`, weightKg: 3 },
      ],
    }
  },
})

export const shipmentLabel = pikkuSessionlessFunc<
  { shipmentId: string; weightKg: number },
  { shipmentId: string; label: string; costCents: number }
>({
  title: 'Label Shipment',
  func: async ({ logger }, data) => {
    logger.info(`Labelling shipment: ${data.shipmentId}`)
    return {
      shipmentId: data.shipmentId,
      label: `LBL-${data.shipmentId}`,
      costCents: data.weightKg * 100,
    }
  },
})

export const shipmentManifest = pikkuSessionlessFunc<
  { labels: Array<{ shipmentId: string; label: string; costCents: number }> },
  { count: number; totalCents: number; labels: string[] }
>({
  title: 'Build Shipment Manifest',
  func: async ({ logger }, data) => {
    logger.info(`Building manifest for ${data.labels.length} shipments`)
    return {
      count: data.labels.length,
      totalCents: data.labels.reduce((sum, l) => sum + l.costCents, 0),
      labels: data.labels.map((l) => l.label),
    }
  },
})
