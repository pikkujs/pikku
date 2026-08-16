import { ref } from '#pikku/function'
import { defineHTTPRoutes, wireHTTPRoutes } from '#pikku/http'

export const oauthApiRoutes = defineHTTPRoutes({
  auth: false,
  routes: {
    getProfile: {
      route: '/api/oauth/profile',
      method: 'post',
      func: ref('oauth-api:getProfile'),
    },
  },
})

wireHTTPRoutes({ routes: { oauthApi: oauthApiRoutes } })
