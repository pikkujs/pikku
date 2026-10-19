//~ name: ui-provider
//~ title: Wire the generated client into React once, at the root
//~ when: The first screen in a new frontend, before any hook can be used. Every other React recipe assumes this is already in place — a component under neither provider throws at render rather than failing the build, which is a confusing way to find out.
//~ entity: job
//~ lang: tsx

//~ steps:
//~ Two providers, and the order matters. `PikkuProvider` carries the transport; react-query
//~ carries the cache; the generated hooks reach for both. Build the client OUTSIDE the
//~ component — one built inside the body is rebuilt on every render, and a fresh
//~ `QueryClient` on every render is a cache that never hits.
// ===== FILE: src/main.tsx =====
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PikkuProvider, createPikku } from '@pikku/react'
import { PikkuFetch } from '#pikku/pikku-fetch.gen.js'
import { PikkuRPC } from '#pikku/pikku-rpc.gen.js'

const pikku = createPikku(PikkuFetch, PikkuRPC, {
  //~ `/api` in every environment. A deployed worker serves the API on the same
  //~ origin under this prefix, and the dev server proxies it there, so the app
  //~ never has to know its own hostname at build time.
  serverUrl: '/api',
})

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PikkuProvider pikku={pikku}>
      <QueryClientProvider client={queryClient}>
        <p>Your app goes here.</p>
      </QueryClientProvider>
    </PikkuProvider>
  </StrictMode>
)
