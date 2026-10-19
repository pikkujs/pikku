import { defineHTTPRoutes, wireHTTPRoutes } from '#pikku/http'
import { listJobs } from '../functions/jobs/list-jobs.function.js'
import { getJob } from '../functions/jobs/get-job.function.js'
import { raiseJob } from '../functions/jobs/raise-job.function.js'
import { assignJob } from '../functions/jobs/assign-job.function.js'
import { setJobStatus } from '../functions/jobs/set-job-status.function.js'
import { listCustomers } from '../functions/customers/list-customers.function.js'
import { listTechnicians } from '../functions/technicians/list-technicians.function.js'
import { logVisit } from '../functions/visits/log-visit.function.js'
import { listQuotes } from '../functions/quotes/list-quotes.function.js'
import { draftQuote } from '../functions/quotes/draft-quote.function.js'
import { decideQuote } from '../functions/quotes/decide-quote.function.js'
import { addVoiceNote } from '../functions/voice-notes/add-voice-note.function.js'
import { getProfile } from '../functions/get-profile.function.js'

/**
 * Every route here requires a session, because every read is tenant-scoped and
 * a tenant comes from a membership, which comes from an account. There is no
 * public surface in this app at all — which is itself the difference between a
 * field-service back office and a shop.
 */
export const fieldServiceRoutes = defineHTTPRoutes({
  auth: true,
  routes: {
    getProfile: { method: 'get', route: '/me', func: getProfile },

    listJobs: { method: 'get', route: '/jobs', func: listJobs },
    getJob: { method: 'get', route: '/jobs/:jobId', func: getJob },
    raiseJob: { method: 'post', route: '/jobs', func: raiseJob },
    assignJob: {
      method: 'post',
      route: '/jobs/:jobId/assign',
      func: assignJob,
    },
    setJobStatus: {
      method: 'patch',
      route: '/jobs/:jobId/status',
      func: setJobStatus,
    },

    listCustomers: { method: 'get', route: '/customers', func: listCustomers },
    listTechnicians: {
      method: 'get',
      route: '/technicians',
      func: listTechnicians,
    },

    logVisit: { method: 'post', route: '/jobs/:jobId/visits', func: logVisit },
    addVoiceNote: {
      method: 'post',
      route: '/jobs/:jobId/notes',
      func: addVoiceNote,
    },

    listQuotes: { method: 'get', route: '/quotes', func: listQuotes },
    draftQuote: { method: 'post', route: '/quotes', func: draftQuote },
    decideQuote: {
      method: 'post',
      route: '/quotes/:quoteId/decision',
      func: decideQuote,
    },
  },
})

wireHTTPRoutes({ routes: { fieldService: fieldServiceRoutes } })
