#!/usr/bin/env node
// Prints the `pikku-inspect --stdin` input for a project, for piping into a
// binary by hand:  node parity/input.ts <projectDir> | pikku-inspect --stdin
import { resolve } from 'node:path'
import { toAnalysisOptions } from '../src/protocol.ts'
import { projectInput } from './project-input.ts'

const { routeFiles, options } = await projectInput(resolve(process.argv[2]))
process.stdout.write(
  JSON.stringify({ routeFiles, options: toAnalysisOptions(options) })
)
