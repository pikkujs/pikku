import { createServer, type Server } from 'http'

const MOCK_PORT = Number(process.env.MOCK_OAUTH_PORT ?? 4098)

let server: Server | undefined
let lastAuthRequest: { state: string; redirectUri: string } | undefined

export function getLastAuthRequest() {
  return lastAuthRequest
}

export function startMockOAuthServer(): Promise<Server> {
  if (server) {
    return Promise.resolve(server)
  }
  return new Promise((resolve, reject) => {
    const s = createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${MOCK_PORT}`)

      if (url.pathname === '/authorize' && req.method === 'GET') {
        const state = url.searchParams.get('state') ?? ''
        const redirectUri = url.searchParams.get('redirect_uri') ?? ''
        lastAuthRequest = { state, redirectUri }
        const callbackUrl = `${redirectUri}?code=mock-auth-code&state=${encodeURIComponent(state)}`
        res.writeHead(302, { Location: callbackUrl })
        res.end()
        return
      }

      if (url.pathname === '/token' && req.method === 'POST') {
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          const params = new URLSearchParams(body)
          const grantType = params.get('grant_type')

          if (grantType === 'authorization_code') {
            const code = params.get('code')
            if (code !== 'mock-auth-code') {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'invalid_grant' }))
              return
            }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                access_token: 'mock-access-token-' + Date.now(),
                refresh_token: 'mock-refresh-token',
                expires_in: 3600,
                token_type: 'Bearer',
                scope: 'read write',
              })
            )
            return
          }

          if (grantType === 'refresh_token') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                access_token: 'mock-refreshed-token-' + Date.now(),
                refresh_token: 'mock-refresh-token',
                expires_in: 3600,
                token_type: 'Bearer',
                scope: 'read write',
              })
            )
            return
          }

          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'unsupported_grant_type' }))
        })
        return
      }

      res.writeHead(404)
      res.end('Not found')
    })

    s.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(s)
      } else {
        reject(err)
      }
    })
    s.listen(MOCK_PORT, () => {
      server = s
      resolve(s)
    })
  })
}

export function stopMockOAuthServer(): void {
  if (server) {
    server.close()
    server = undefined
  }
}
