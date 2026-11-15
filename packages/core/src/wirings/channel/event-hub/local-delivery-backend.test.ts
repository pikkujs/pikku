import { createLocalDeliveryBackend } from './local-delivery-backend.js'
import { defineEventHubDeliveryBackendTests } from '../../../testing/service-tests/event-hub-delivery-backend-tests.js'

defineEventHubDeliveryBackendTests('local', createLocalDeliveryBackend)
