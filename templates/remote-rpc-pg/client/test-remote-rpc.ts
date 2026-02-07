async function testRemoteRpc(
  fromPort: number,
  expectOtherPort: number
): Promise<void> {
  const res = await fetch(`http://localhost:${fromPort}/remote-greet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test', greeting: 'Hi' }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `POST /remote-greet on ${fromPort} failed: ${res.status} ${body}`
    )
  }

  const result: any = await res.json()

  if (result.message !== 'Hi, Test!') {
    throw new Error(`Unexpected message: ${result.message}`)
  }

  if (result.serverPort === fromPort) {
    console.log(
      `  [port ${fromPort}] rpc.remote() routed to itself (only 2 servers, both valid targets)`
    )
  } else if (result.serverPort === expectOtherPort) {
    console.log(
      `  [port ${fromPort}] rpc.remote() routed to port ${expectOtherPort}`
    )
  } else {
    throw new Error(`Unexpected serverPort: ${result.serverPort}`)
  }
}

async function main(): Promise<void> {
  console.log('Remote RPC Two-Server Test')
  console.log('==========================\n')

  console.log('Test 1: Call /remote-greet on port 3001')
  console.log(
    '  remoteGreet -> rpc.remote("greet") -> DeploymentService lookup -> HTTP /rpc/greet'
  )
  await testRemoteRpc(3001, 3002)
  console.log('  PASSED\n')

  console.log('Test 2: Call /remote-greet on port 3002')
  console.log(
    '  remoteGreet -> rpc.remote("greet") -> DeploymentService lookup -> HTTP /rpc/greet'
  )
  await testRemoteRpc(3002, 3001)
  console.log('  PASSED\n')

  console.log('All tests passed!')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(`\nTEST FAILED: ${e.message}`)
    process.exit(1)
  })
