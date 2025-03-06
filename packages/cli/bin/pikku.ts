#!/usr/bin/env node
import { Command } from 'commander'
import { schemas } from './pikku-schemas.js'
import { routes } from './pikku-http.js'
import { nextjs } from './pikku-nextjs.js'
import { all } from './pikku-all.js'
import { functionTypes } from './pikku-function-types.js'
import { routesMap } from './pikku-routes-map.js'
import { fetch } from './pikku-fetch.js'
import { channels } from './pikku-channels.js'
import { schedules } from './pikku-scheduler.js'

const program = new Command('pikku')
program.usage('[command]')

all(program)
routes(program)
routesMap(program)
functionTypes(program)
schemas(program)
nextjs(program)
fetch(program)
channels(program)
schedules(program)

program.parse(process.argv)
