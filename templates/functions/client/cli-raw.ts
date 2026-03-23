/**
 * Test client for raw CLI mode over WebSocket.
 * Sends raw args to the __raw handler and prints the response.
 * Usage: npx tsx client/cli-raw.ts <args...>
 *   e.g. npx tsx client/cli-raw.ts list
 *        npx tsx client/cli-raw.ts add "Buy milk" --priority high
 *        npx tsx client/cli-raw.ts (shows help)
 */
import WebSocket from 'ws'

const WS_URL = process.env.PIKKU_WS_URL || 'ws://localhost:4002/cli/todo-cli'
const args = process.argv.slice(2)

const ws = new WebSocket(WS_URL)

const timeout = setTimeout(() => {
  console.error('Connection timed out')
  ws.close()
  process.exit(1)
}, 10000)

ws.on('open', () => {
  clearTimeout(timeout)
  ws.send(JSON.stringify({ command: '__raw', args }))
})

ws.on('message', (data: WebSocket.Data) => {
  try {
    const msg = JSON.parse(data.toString())
    if (msg.help) {
      console.log(msg.help)
    } else if (msg.error) {
      console.error('Error:', msg.error)
      process.exitCode = 1
    } else if (msg.result !== undefined) {
      console.log(JSON.stringify(msg.result, null, 2))
    } else {
      console.log(JSON.stringify(msg, null, 2))
    }
  } catch {
    console.log(data.toString())
  }
})

ws.on('close', () => {
  process.exit(process.exitCode ?? 0)
})

ws.on('error', (err) => {
  clearTimeout(timeout)
  console.error('WebSocket error:', err.message)
  process.exit(1)
})
