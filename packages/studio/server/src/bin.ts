#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { startStudioServer } from './server.js'

const { values } = parseArgs({ options: { port: { type: 'string' }, host: { type: 'string' } } })
const studio = await startStudioServer({
  port: values.port ? Number(values.port) : undefined,
  host: values.host,
})
console.log(`Pikku Studio on ${studio.url}/console/`)
const stop = async () => {
  await studio.close()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
