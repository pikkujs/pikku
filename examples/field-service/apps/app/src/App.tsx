import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PikkuProvider } from '@pikku/react'
import { pikku } from './pikku-client.js'
import { JobList } from './examples/ui-list.js'
import { RaiseJobForm } from './examples/ui-mutation.js'
import { JobHistory } from './examples/ui-infinite-list.js'
import { LiveBoard } from './examples/ui-live-board.js'
import { QuoteForm } from './examples/ui-typed-form.js'
import { QuoteGate } from './examples/ui-workflow-gate.js'
import { DispatchChat } from './examples/ui-agent-chat.js'
import { DevSignIn } from './examples/ui-dev-sign-in.js'

/**
 * The app is the examples, mounted.
 *
 * Every recipe in `src/examples/` is a real component this page renders, which
 * is the only way a teaching example stays true: CI typechecks this app, so a
 * hook that changes shape breaks the build rather than quietly becoming wrong
 * in the docs.
 */
const queryClient = new QueryClient()

export const App = () => (
  <PikkuProvider pikku={pikku}>
    <QueryClientProvider client={queryClient}>
      <main style={{ fontFamily: 'system-ui', padding: 24, maxWidth: 720 }}>
        <h1>Field Service</h1>
        <DevSignIn />
        <RaiseJobForm />
        <JobList />
        <LiveBoard companyId="co_northwind" />
        <JobHistory />
        <QuoteForm jobId="job_leak" />
        <QuoteGate quoteId="quote_boiler" />
        <DispatchChat threadId="dispatch-demo" />
      </main>
    </QueryClientProvider>
  </PikkuProvider>
)
