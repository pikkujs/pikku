import { pikkuConfig } from '#pikku/setup'

export const createConfig = pikkuConfig(async () => {
  return {
    awsRegion: 'us-east-1',
    jwtSecrets: {
      remote: 'PIKKU_REMOTE_SECRET',
    },
  }
})
