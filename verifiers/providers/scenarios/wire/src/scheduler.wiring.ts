import { wireScheduler } from '#pikku/scheduler'
import { usesEvents } from './functions.js'

wireScheduler({ name: 'events', schedule: '0 0 * * *', func: usesEvents })
