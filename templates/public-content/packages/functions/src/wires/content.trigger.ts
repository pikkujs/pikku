import { wireTrigger } from '#pikku/trigger/pikku-trigger-types.gen.js'
import { wireScheduler } from '#pikku/scheduler'
import { onPostDue } from '../functions/on-post-due.function.js'
import { sweepDuePosts } from '../functions/sweep-due-posts.function.js'

// @snippet start wireTrigger
// The handler is in its own file — Pikku resolves trigger metadata per file, so
// declaring it beside the wiring gets it skipped as "metadata not found".
wireTrigger({
  name: 'post-due',
  func: onPostDue,
})

// A scheduled task, not a `setInterval` inside a trigger source.
//
// A post becoming due is the clock passing rather than an event anybody emits,
// so something has to look. The original looked by spinning its own timer,
// which reimplemented the scheduler badly: it could not be invoked once, could
// not be tested, and leaked an interval per call if anything ever did call it.
// `wireScheduler` already solves clock-driven work — the sweep below is one
// pass, callable by hand, and provable.
wireScheduler({
  name: 'sweepDuePosts',
  schedule: '* * * * *',
  func: sweepDuePosts,
})
// @snippet end wireTrigger
