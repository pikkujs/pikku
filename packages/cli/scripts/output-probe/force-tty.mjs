// Loaded with `node --import` so it runs before the CLI's own modules: chalk
// and every `process.stdin.isTTY` prompt gate read these at import time.
for (const s of [process.stdin, process.stdout, process.stderr])
  Object.defineProperty(s, 'isTTY', { value: true, configurable: true })
process.env.FORCE_COLOR ??= '3'
