import { pikkuSessionlessFunc } from '#pikku/function'

export const greet = pikkuSessionlessFunc<
  { name: string },
  { message: string }
>({
  expose: true,
  auth: false,
  func: async (_services, { name }) => ({ message: `Hello, ${name}!` }),
})

// Needs `stamper` from the project that wires the addon, which the base provides.
export const stamped = pikkuSessionlessFunc<{ text: string }, { text: string }>(
  {
    auth: false,
    func: async ({ stamper }, { text }) => ({ text: stamper.stamp(text) }),
  }
)

// Declared exposed by the addon, but the base's wireAddon lists only `greet`.
export const farewell = pikkuSessionlessFunc<
  { name: string },
  { message: string }
>({
  expose: true,
  auth: false,
  func: async (_services, { name }) => ({ message: `Goodbye, ${name}!` }),
})

export const hidden = pikkuSessionlessFunc<void, { ok: true }>({
  func: async () => ({ ok: true }),
})
