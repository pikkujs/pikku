import { OAuth2Server } from 'oauth2-mock-server'

async function main() {
  console.log('Starting OAuth2 mock server...')

  const server = new OAuth2Server()

  // Generate RSA key for signing tokens
  await server.issuer.keys.generate('RS256')

  // Start server
  await server.start(8080, 'localhost')

  console.log('OAuth2 mock server running at:', server.issuer.url)
  console.log('')
  console.log('Available endpoints:')
  console.log('  Authorization: http://localhost:8080/authorize')
  console.log('  Token:         http://localhost:8080/token')
  console.log('  JWKS:          http://localhost:8080/.well-known/jwks.json')
  console.log('')
  console.log('Mock app credentials (set as env var):')
  console.log(
    '  export MOCK_OAUTH_APP=\'{"clientId":"test-client","clientSecret":"test-secret"}\''
  )
  console.log('')
  console.log('Test commands:')
  console.log('  yarn pikku oauth:status mock')
  console.log('  yarn pikku oauth:connect mock')
  console.log('')
  console.log('Press Ctrl+C to stop the server')

  // Keep server running
  process.on('SIGINT', async () => {
    console.log('\nStopping server...')
    await server.stop()
    process.exit(0)
  })
}

main().catch(console.error)
