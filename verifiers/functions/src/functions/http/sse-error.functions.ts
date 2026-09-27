import { pikkuSessionlessFunc } from '#pikku/function'

/**
 * A stream that fails once the response is already committed to streaming, so
 * the error can only reach the client as a frame on the open stream.
 */
export const failingStream = pikkuSessionlessFunc<void, void>(async () => {
  throw new Error('the stream broke')
})
