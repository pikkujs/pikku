import { pikkuCLIRender } from '@pikku/core'

/**
 * CLI renderers
 * Transform function output for console display
 */

// Simple text renderer
export const greetRenderer = pikkuCLIRender<{
  message: string
  timestamp: string
}>((_services, output) => {
  console.log(output.message)
  console.log(`Generated at: ${output.timestamp}`)
})

// Calculator result renderer
export const calcRenderer = pikkuCLIRender<{
  expression: string
  result: number
}>((_services, output) => {
  console.log(`Expression: ${output.expression}`)
  console.log(`Result: ${output.result}`)
})

// JSON fallback renderer (global)
export const jsonRenderer = pikkuCLIRender((_services, output: any) => {
  console.log(JSON.stringify(output, null, 2))
})

// Table renderer for lists
export const tableRenderer = pikkuCLIRender<{ items: any[]; total: number }>(
  (_services, output) => {
    console.log(`Found ${output.total} items:`)
    console.table(output.items)
  }
)

// Success/error renderer
export const resultRenderer = pikkuCLIRender<{
  success: boolean
  message?: string
  error?: string
}>((_services, output) => {
  if (output.success) {
    console.log(`✓ ${output.message || 'Success'}`)
  } else {
    console.error(`✗ ${output.error || 'Operation failed'}`)
    process.exit(1)
  }
})
