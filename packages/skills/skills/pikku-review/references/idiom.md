# Pikku idiom

The code that survives is the code that uses what Pikku already gives you.

- Does the function get everything from `data`, `services` and `session`?
- Does it import another function's file, where `ref()` or `rpc` belongs?
- Is `rpc` passed into a helper? That hides the call from the deploy planner.
- Is `lib` pure, or does it do I/O or import app code?
- Is there `process.env`, `node:fs` or raw `fetch` in a function?
- Does each declared flag do what it implies? A flag that writes nothing still reads as if it works.
- Is this a hand-written version of something Pikku generates or provides?
- Is the same helper duplicated in other files?
