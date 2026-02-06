const PORT = process.env.PORT || '3001'
const BASE_URL = `http://localhost:${PORT}`

async function main(): Promise<void> {
  console.log('Remote RPC Test')
  console.log('================\n')

  console.log('Test: Calling /remote-greet (uses rpc.remote() internally)')
  console.log('  → remoteGreet calls rpc.remote("greet", data)')
  console.log('  → rpc.remote() discovers endpoint via DeploymentService')
  console.log('  → Makes HTTP call to /rpc/greet\n')

  const response = await fetch(`${BASE_URL}/remote-greet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Remote Client', greeting: 'Greetings' }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error(
      `Remote RPC failed: ${response.status} ${response.statusText}`
    )
    console.error(errorBody)
    process.exit(1)
  }

  const result = await response.json()
  console.log('Result:', JSON.stringify(result, null, 2))

  if (result.message === 'Greetings, Remote Client!') {
    console.log('\n✓ Remote RPC test passed!')
    console.log(
      '  The call went through: HTTP → remoteGreet → rpc.remote() → HTTP → greet'
    )
  } else {
    console.error('\n✗ Unexpected result')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('Test failed:', e.message)
  process.exit(1)
})
