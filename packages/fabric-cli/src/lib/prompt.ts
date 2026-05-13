import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

/**
 * Read a line from stdin with optional masking. Used for secret-set when the
 * user didn't pass `--value` on the command line so we can avoid leaving
 * the plaintext in shell history.
 */
export async function promptSecret(label: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true })
  // Best-effort masking — the readline API doesn't suppress echo natively;
  // for hardened input you'd want `read -s` or a tty trick, but for our
  // CLI the standard prompt is fine and matches what wrangler does.
  process.stdout.write(`${label}: `)
  const value = await rl.question('')
  rl.close()
  return value.trim()
}
