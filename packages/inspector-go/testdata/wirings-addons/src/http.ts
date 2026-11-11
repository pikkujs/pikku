import { wireHTTPRoutes } from '@pikku/core/http'
import { refHTTP } from './pikku.js'

wireHTTPRoutes({
  basePath: '/api',
  tags: ['app'],
  routes: {
    shop: refHTTP('shop:shopRoutes'),
    moved: refHTTP('shop:shopRoutes', { basePath: '/ext' }),
    unknown: refHTTP('shop:noSuchRoutes'),
  },
})

wireHTTPRoutes({ routes: refHTTP('shop:shopRoutes') })
