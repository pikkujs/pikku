#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { piArgs, resolvePi } from './pi.js'
import { writeSkills } from './skills.js'

const skills = await writeSkills()
const child = spawn(process.execPath, [resolvePi(), ...piArgs({ skills }), ...process.argv.slice(2)], {
  stdio: 'inherit',
})
child.on('exit', (code, signal) => (signal ? process.kill(process.pid, signal) : process.exit(code ?? 0)))
