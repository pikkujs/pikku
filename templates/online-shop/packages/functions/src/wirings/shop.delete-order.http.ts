import { wireHTTP } from '#pikku/http'
import { deleteOrder } from '../functions/orders/delete-order.function.js'

// @snippet start shopAuthScope
// Sessions arrive from Better Auth — the CLI generates the session-bridge
// middleware from src/wirings/auth.wiring.ts, so nothing here has to read a
// cookie or a bearer header itself.
//
// `auth: true` is the baseline: no session, no call. Authorization lives on
// the function (see deleteOrder above); the wiring only maps the route to it.
wireHTTP({
  method: 'delete',
  route: '/orders/:orderId',
  func: deleteOrder,
  auth: true,
})
// @snippet end shopAuthScope
