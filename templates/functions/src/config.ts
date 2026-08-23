import { pikkuConfig } from '#pikku/setup'

// @snippet start pikku-config
export const createConfig = pikkuConfig(async () => {
  return {
    awsRegion: 'us-east-1',
    jwtSecrets: {
      remote: 'PIKKU_REMOTE_SECRET',
    },
  }
})
// @snippet end pikku-config
