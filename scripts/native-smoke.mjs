#!/usr/bin/env node
// Waits for a launched native build of e2e/packages/web to call home.
//
// A packaged app has no hooks a test can drive, so the evidence is on the
// server: the app records `native_opened` through `nativeOpened` once it has
// rendered and reached its API, and `readAnalytics` reports it. Launching is
// the job's business, since it differs on every platform; this only polls.
//
//   node scripts/native-smoke.mjs [apiUrl] [timeoutSeconds]
const apiUrl = process.argv[2] ?? 'http://localhost:4077'
const timeoutSeconds = Number(process.argv[3] ?? 120)

const readOpened = async () => {
  const response = await fetch(`${apiUrl}/rpc/readAnalytics`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  if (!response.ok) return []
  const { all } = await response.json()
  return all.filter((event) => event.name === 'native_opened')
}

const deadline = Date.now() + timeoutSeconds * 1000
while (Date.now() < deadline) {
  const opened = await readOpened().catch(() => [])
  if (opened.length > 0) {
    console.log(
      `The app reached ${apiUrl}: ${JSON.stringify(opened[0].props)}`
    )
    process.exit(0)
  }
  await new Promise((resolve) => setTimeout(resolve, 2000))
}
console.error(
  `No native_opened reached ${apiUrl} within ${timeoutSeconds}s — the app did not start, did not render, or could not reach its API.`
)
process.exit(1)
