import { wireAddon } from '#pikku/addon'
import { wireHTTP } from '#pikku/http'
import { wireQueueWorker } from '#pikku/queue'
import { wireScheduler } from '#pikku/scheduler'
import { enqueueJob, processJob, startFlow, tick } from './jobs.js'

wireAddon({ name: 'nats', package: '@pikku/queue-nats', services: ['nats'] })

wireHTTP({ method: 'post', route: '/enqueue', auth: false, func: enqueueJob })
wireHTTP({ method: 'post', route: '/start-flow', auth: false, func: startFlow })
wireQueueWorker({ name: 'jobs', func: processJob })
wireScheduler({ name: 'tick', schedule: '@every 2s', func: tick })
