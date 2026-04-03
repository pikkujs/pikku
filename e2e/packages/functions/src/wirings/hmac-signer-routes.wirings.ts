import {
  defineHTTPRoutes,
  wireHTTPRoutes,
  addon,
} from '#pikku/pikku-types.gen.js'

export const hmacRoutes = defineHTTPRoutes({
  auth: false,
  routes: {
    sign: {
      route: '/api/hmac/sign',
      method: 'post',
      func: func('hmac-signer:signData'),
    },
    verify: {
      route: '/api/hmac/verify',
      method: 'post',
      func: func('hmac-signer:verifySignature'),
    },
  },
})

wireHTTPRoutes({ routes: { hmac: hmacRoutes } })
