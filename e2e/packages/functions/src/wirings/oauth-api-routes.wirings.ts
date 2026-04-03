import {
  defineHTTPRoutes,
  wireHTTPRoutes,
  addon,
} from '#pikku/pikku-types.gen.js'

export const oauthApiRoutes = defineHTTPRoutes({
  auth: false,
  routes: {
    getProfile: {
      route: '/api/oauth/profile',
      method: 'post',
      func: func('oauth-api:getProfile'),
    },
  },
})

wireHTTPRoutes({ routes: { oauthApi: oauthApiRoutes } })
