const url = process.env.TODO_APP_URL || 'http://localhost:4002'
console.log('Starting agent SSE test with url:', url)

const TIMEOUT = 60000
const RETRY_INTERVAL = 2000
const start = Date.now()

const runId = Math.random().toString(36).slice(2, 8)

async function testStreamAgent() {
  console.log('\n--- Stream: Ask daily-planner for advice ---')

  const params = new URLSearchParams({
    message: 'Plan my afternoon — I have 3 hours free',
    threadId: `stream-test-${runId}`,
    resourceId: 'test-user',
  })

  const response = await fetch(
    `${url}/rpc/agent/daily-planner/stream?${params}`,
    {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
      },
    }
  )

  if (!response.ok || !response.body) {
    throw new Error(
      `Stream failed: ${response.status} ${await response.text()}`
    )
  }

  let eventCount = 0
  let textDeltas = 0
  let usageEvents = 0

  const decoder = new TextDecoder()
  let buffer = ''
  const reader = response.body.getReader()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = JSON.parse(line.slice(6))
      eventCount++

      switch (data.type) {
        case 'text-delta':
          textDeltas++
          process.stdout.write(data.text)
          break
        case 'tool-call':
          console.log(`\n  [tool-call] ${data.toolName}`)
          break
        case 'tool-result':
          console.log(`  [tool-result] ${data.toolName}`)
          break
        case 'usage':
          usageEvents++
          console.log(
            `\n  [usage] in=${data.tokens.input} out=${data.tokens.output}`
          )
          break
        case 'done':
          console.log('  [done]')
          break
        case 'error':
          console.log(`\n  [error] ${data.message}`)
          break
      }
    }
  }

  console.log(`Total events: ${eventCount}`)
  console.log(`Text deltas: ${textDeltas}`)
  console.log(`Usage events: ${usageEvents}`)
}

async function check() {
  try {
    await testStreamAgent()
    console.log('\n✅ Agent SSE test passed')
    process.exit(0)
  } catch (err: any) {
    console.log(`Still failing (${err.message ?? err}), retrying...`)
  }

  if (Date.now() - start > TIMEOUT) {
    console.error(`❌ Agent SSE test failed after ${TIMEOUT / 1000} seconds`)
    process.exit(1)
  } else {
    setTimeout(check, RETRY_INTERVAL)
  }
}

check()
