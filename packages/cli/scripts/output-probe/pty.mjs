/**
 * Capture interactive output: prompt text, the answer typed, what came back.
 *
 * `--import force-tty.mjs` makes `process.stdin.isTTY` true before the CLI's
 * modules load, so prompt gates fire and chalk colours, without a pty or a
 * native dependency. Answers are typed in when the transcript goes quiet.
 */
import { spawn } from 'node:child_process'

export const captureInteractive = ({ argv, answers = [], cwd, quietMs = 300, timeoutMs = 20000 }) =>
  new Promise((resolve) => {
    const shim = new URL('./force-tty.mjs', import.meta.url).pathname
    const child = spawn('node', ['--import', shim, ...argv], {
      cwd, env: { ...process.env, FORCE_COLOR: '3', COLUMNS: '100' }, stdio: ['pipe', 'pipe', 'pipe'],
    })
    const t0 = performance.now()
    const events = []
    let buf = '', quiet, next = 0

    const onQuiet = () => {
      const prompt = buf.slice(buf.lastIndexOf('\n') + 1)
      if (next >= answers.length) {
        if (prompt.trim()) events.push({ at: +(performance.now() - t0).toFixed(1), prompt, answer: null, note: 'no scripted answer left' })
        child.stdin.end()
        return
      }
      const answer = answers[next++]
      events.push({ at: +(performance.now() - t0).toFixed(1), prompt, answer })
      buf += `${answer}\n` // a real terminal echoes the keystroke; a pipe does not
      child.stdin.write(`${answer}\n`)
    }
    const onData = (c) => { buf += c.toString(); clearTimeout(quiet); quiet = setTimeout(onQuiet, quietMs) }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

    const done = (exitCode) => {
      clearTimeout(quiet); clearTimeout(kill)
      resolve({ ms: +(performance.now() - t0).toFixed(1), exitCode, transcript: buf, events })
    }
    const kill = setTimeout(() => { child.kill('SIGKILL'); done('timeout') }, timeoutMs)
    child.on('close', done)
  })

if (process.argv[2]) {
  const [, , cmd, ...answers] = process.argv
  console.log(JSON.stringify(await captureInteractive({ argv: cmd.split(' '), answers }), null, 2))
}
