#!/usr/bin/env node
import { Command } from 'commander'
import { all } from './pikku-all.js'

const program = new Command('pikku')
program.usage('[command]')

all(program)

program.parse(process.argv)
