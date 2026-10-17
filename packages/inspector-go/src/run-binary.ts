import { spawn } from 'node:child_process'
import {
  INSPECTOR_PROTOCOL_VERSION,
  type InspectorGoInput,
  type InspectorGoOutput,
} from './protocol.js'

export class InspectorBinaryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InspectorBinaryError'
  }
}

/**
 * Runs `pikku-inspect --stdin`, writes the input and parses what it prints.
 * stderr is passed through untouched; only stdout is the protocol.
 */
export const runInspectorBinary = (
  binary: string,
  input: InspectorGoInput
): Promise<InspectorGoOutput> =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(binary, ['--stdin'], {
      stdio: ['pipe', 'pipe', 'inherit'],
    })
    const chunks: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.on('error', (error) =>
      reject(
        new InspectorBinaryError(`Could not start ${binary}: ${error.message}`)
      )
    )
    child.on('close', (code, signal) => {
      if (code !== 0) {
        reject(
          new InspectorBinaryError(
            `${binary} exited with ${signal ?? `code ${code}`}`
          )
        )
        return
      }
      let output: InspectorGoOutput
      try {
        output = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch (error: any) {
        reject(
          new InspectorBinaryError(
            `${binary} printed something that is not JSON: ${error.message}`
          )
        )
        return
      }
      if (output?.protocol !== INSPECTOR_PROTOCOL_VERSION) {
        reject(
          new InspectorBinaryError(
            `${binary} speaks protocol ${output?.protocol}, expected ${INSPECTOR_PROTOCOL_VERSION}`
          )
        )
        return
      }
      resolvePromise(output)
    })
    child.stdin.end(JSON.stringify(input))
  })
