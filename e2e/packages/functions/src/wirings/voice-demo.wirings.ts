import { defineHTTPRoutes, wireHTTPRoutes } from '#pikku/pikku-types.gen.js'
import {
  voiceDemoCompare,
  voiceDemoInterrupt,
  voiceDemoModule,
  voiceDemoPage,
  voiceDemoSpeak,
  voiceDemoTranscribe,
} from '../functions/voice-demo.function.js'

/**
 * The demo page and the three calls it makes that the generated agent routes do
 * not already cover: transcription, speech for the approval question, and
 * interruption — there is no generated interrupt route because interrupting
 * ends a stream rather than continuing one.
 *
 * Unauthenticated, like the rest of the e2e HTTP surface. It reads and writes
 * the same seeded todo list every other e2e scenario uses.
 */
export const voiceDemoRoutes = defineHTTPRoutes({
  auth: false,
  routes: {
    page: {
      route: '/voice-demo',
      method: 'get',
      func: voiceDemoPage,
    },
    module: {
      route: '/voice-demo/lib/:file',
      method: 'get',
      func: voiceDemoModule,
    },
    transcribe: {
      route: '/voice-demo/transcribe',
      method: 'post',
      func: voiceDemoTranscribe,
    },
    // Diagnostic only, and off the turn's critical path — see voiceDemoCompare.
    compare: {
      route: '/voice-demo/compare',
      method: 'post',
      func: voiceDemoCompare,
    },
    speak: {
      route: '/voice-demo/speak',
      method: 'post',
      func: voiceDemoSpeak,
    },
    interrupt: {
      route: '/voice-demo/interrupt',
      method: 'post',
      func: voiceDemoInterrupt,
    },
  },
})

wireHTTPRoutes({ routes: { voiceDemo: voiceDemoRoutes } })
