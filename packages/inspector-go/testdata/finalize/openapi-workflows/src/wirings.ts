import {
  wireHTTP,
  wireScheduler,
  wireQueueWorker,
  workflow,
  workflowStart,
  workflowStatus,
  graphStart,
} from './pikku.js'
import {
  getItem,
  listItems,
  searchItems,
  createItem,
  ping,
  countItems,
  deleteItem,
  archiveItem,
} from './functions.js'

declare class NotFoundError extends Error {}
declare class ForbiddenError extends Error {}
declare class UnknownCustomError extends Error {}

wireHTTP({
  method: 'get',
  route: '/items/:id',
  func: getItem,
  tags: ['items', 'read'],
  errors: [NotFoundError, ForbiddenError, UnknownCustomError],
})
wireHTTP({
  method: 'get',
  route: '/items',
  func: listItems,
  query: ['page', 'q'],
  description: 'List all items',
})
wireHTTP({ method: 'get', route: '/search', func: searchItems })
wireHTTP({ method: 'post', route: '/items', func: createItem })
wireHTTP({ method: 'get', route: '/ping', func: ping })
wireHTTP({ method: 'get', route: '/', func: countItems })
wireHTTP({
  method: 'delete',
  route: '/orgs/:orgId/items/:id',
  func: deleteItem,
  errors: [NotFoundError],
})
wireHTTP({ method: 'post', route: '/items/:id/archive', func: archiveItem })
wireHTTP({
  method: 'post',
  route: '/restock',
  func: workflowStart('restockWorkflow'),
})
wireHTTP({
  method: 'get',
  route: '/restock/status',
  func: workflowStatus('restockWorkflow'),
})
wireHTTP({
  method: 'post',
  route: '/review',
  func: graphStart('reviewGraph', 'notify'),
})
wireScheduler({
  name: 'nightlyRestock',
  schedule: '0 1 * * *',
  func: workflow('restockWorkflow'),
})
wireQueueWorker({
  name: 'review-queue',
  func: workflowStart('reviewGraph'),
})
