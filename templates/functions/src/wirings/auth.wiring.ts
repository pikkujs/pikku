import { wireAuth } from '@pikku/auth-js'

wireAuth({
  credentials: {
    fields: {
      username: { label: 'Username', type: 'text' },
      password: { label: 'Password', type: 'password' },
    },
    authorize: async (_rpc, credentials) => {
      if (
        credentials.username === 'admin' &&
        credentials.password === 'password'
      ) {
        return { id: '1', name: 'Admin', email: 'admin@example.com' }
      }
      return null
    },
  },
})
