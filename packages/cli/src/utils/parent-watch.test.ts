import assert from 'node:assert'
import { spawn } from 'node:child_process'
import { test } from 'node:test'
import { isRunning } from './codegen-lock.js'

const here = new URL('./parent-watch.ts', import.meta.url).href

test('a child exits once its parent is killed', async () => {
  // parent spawns a grandchild that watches the parent, prints its pid, then dies
  const parent = spawn(
    process.execPath,
    [
      '-e',
      `const {spawn}=require('child_process');
       const c=spawn(process.execPath,['--import','tsx','--input-type=module','-e',
       "import {exitWhenParentDies} from '${here}'; exitWhenParentDies(Number(process.argv[1]),()=>process.exit(0),100); setInterval(()=>{},1000)", String(process.pid)],{stdio:'inherit'});
       console.log(c.pid); setInterval(()=>{},1000)`,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] }
  )
  const pid = await new Promise<number>((resolve) =>
    parent.stdout!.once('data', (d) => resolve(Number(String(d).trim())))
  )
  await new Promise((r) => setTimeout(r, 1500))
  assert.equal(isRunning(pid), true)
  parent.kill('SIGKILL')
  for (let i = 0; i < 80 && isRunning(pid); i++) {
    await new Promise((r) => setTimeout(r, 100))
  }
  assert.equal(isRunning(pid), false)
})
