import { fetch } from '@pikku/core/http'

/**
 * A route whose only gate is a global permission registered in a file nothing
 * imports. It is refused only if codegen imported that file.
 */
export async function testGlobalPermissionWiring(): Promise<boolean> {
  console.log('\n\nTest: /globally-denied')
  console.log('─────────────────────────')

  const response = await fetch(new Request('http://localhost/globally-denied'))
  const passed = response.status === 403
  console.log(
    passed
      ? '\n✓ The global permission refused the call (403)'
      : `\n✗ The global permission did not run: status ${response.status}`
  )
  return passed
}
