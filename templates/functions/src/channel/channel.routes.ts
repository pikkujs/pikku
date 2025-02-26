import { addChannel } from '../../.pikku/pikku-types.gen.js'
import {
  onConnect,
  onDisconnect,
  onMessage,
  authenticate,
  subscribe,
  unsubscribe,
  emitMessage,
} from './channel.functions.js'

addChannel({
  // The channel name, this is used to identify the channel with types in the client
  // and needs to be unique
  name: 'events',
  // The route to use for the channel. For serverless this is usually / unless using
  // a custom domain
  route: '/',
  // Called when a client connects to the channel
  onConnect,
  // Called when a client disconnects from the channel
  onDisconnect,
  // This is a global permission that applies to all message routes,
  // unless overriden by the route
  auth: true,
  // The default message handler to use if no route is matched
  onMessage,
  onMessageRoute: {
    // We provide different examples of ways
    // to register functions
    action: {
      // This function will set the user session, which
      // means other functions will then work
      auth: {
        func: authenticate,
        auth: false,
      },
      // A route with an nested function. This is to allow permissions
      // to be applied to the route.
      subscribe: {
        func: subscribe,
        permissions: {},
      },
      // A shorthand method, this is a special case in typescript
      // so figured it would be useful to include
      unsubscribe,
      // A route that references a function
      emit: emitMessage,
    },
  },
})
