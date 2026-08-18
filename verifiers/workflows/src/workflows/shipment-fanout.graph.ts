import { pikkuWorkflowGraph } from '#pikku/workflow/pikku-workflow-types.gen.js'

// A graph node that fans out over an upstream array: `label` runs once per
// shipment, binding each element through `$item`, and its own result is the
// ordered array of per-item results that `manifest` folds back up.
export const graphShipmentFanout = pikkuWorkflowGraph({
  description: 'Graph fan-out: one label per shipment, then one manifest',
  tags: ['fanout', 'graph'],
  nodes: {
    list: 'shipmentList',
    label: 'shipmentLabel',
    manifest: 'shipmentManifest',
  },
  config: {
    list: {
      input: (ref) => ({ orderId: ref('trigger', 'orderId') }),
      next: 'label',
    },
    label: {
      forEach: (ref) => ref('list', 'shipments'),
      input: (ref, template, $item) => ({
        shipmentId: $item('shipmentId'),
        weightKg: $item('weightKg'),
      }),
      next: 'manifest',
    },
    manifest: {
      input: (ref) => ({ labels: ref('label') }),
    },
  },
})

// The same fan-out, one item at a time.
export const graphShipmentFanoutSequential = pikkuWorkflowGraph({
  description: 'Graph fan-out: labels one shipment at a time',
  tags: ['fanout', 'graph'],
  nodes: {
    list: 'shipmentList',
    label: 'shipmentLabel',
    manifest: 'shipmentManifest',
  },
  config: {
    list: {
      input: (ref) => ({ orderId: ref('trigger', 'orderId') }),
      next: 'label',
    },
    label: {
      forEach: (ref) => ref('list', 'shipments'),
      mode: 'sequential',
      input: (ref, template, $item) => ({
        shipmentId: $item('shipmentId'),
        weightKg: $item('weightKg'),
      }),
      next: 'manifest',
    },
    manifest: {
      input: (ref) => ({ labels: ref('label') }),
    },
  },
})
