import { refHTTP } from '#pikku/function'
import { wireHTTPRoutes } from '#pikku/http'

// @snippet start refHTTP
// The name is `<addon name>:<contract name>`; basePath moves the addon's routes.
wireHTTPRoutes({
  routes: { todos: refHTTP('todos:todoRoutes', { basePath: '/api/todos' }) },
})
// @snippet end refHTTP
