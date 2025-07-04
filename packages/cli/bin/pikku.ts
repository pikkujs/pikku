#!/usr/bin/env node
import { Command } from 'commander'
import { schemas } from './pikku-schemas.js'
import { nextjs } from './pikku-nextjs.js'
import { all } from './pikku-all.js'
import { fetch } from './pikku-fetch.js'
import { queue } from './pikku-queue-service.js'

const program = new Command('pikku')
program.usage('[command]')

all(program)
schemas(program)
nextjs(program)
fetch(program)
queue(program)

program.parse(process.argv)
