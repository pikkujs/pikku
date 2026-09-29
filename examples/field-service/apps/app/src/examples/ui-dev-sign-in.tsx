//~ name: ui-dev-sign-in
//~ title: Offer one-click sign-in as a declared persona while developing
//~ when: The app has a sign-in wall and every screen behind it is unreachable until somebody types a password — which is every new project, on the first day. Use this to get a working session in one click during development, and to let browser scenarios in as the persona they are written for. It renders nothing in production.
//~ entity: technician
//~ lang: tsx

//~ steps:
//~ The server decides who is offered: `listDevActors` returns nobody wherever the
//~ switcher is off, and `pikkuActor({ personaSignIn })` refuses a sign-in behind the
//~ same gate. Nothing about a persona but its id and label reaches the browser, so
//~ there is no credential to keep out of the production bundle.
// ===== FILE: src/components/dev-sign-in.tsx =====
import { useDevActors, usePikkuRPC } from '@pikku/react'
import type { PikkuRPC } from '../../../../.pikku/pikku-rpc.gen'

export const DevSignIn = () => {
  const rpc = usePikkuRPC<PikkuRPC>()
  const { actors, signInAs, pendingId, error } = useDevActors({
    list: () => rpc.invoke('listDevActors', {}),
    apiUrl: '/api',
    onSignedIn: () => {
      //~ A full reload rather than a router push. Everything on the page was
      //~ fetched as nobody, so the cheapest correct thing is to start again as
      //~ somebody.
      window.location.assign('/')
    },
  })

  if (actors.length === 0) return null

  return (
    <section>
      <h2>Sign in as…</h2>
      <ul>
        {actors.map((actor) => (
          <li key={actor.id}>
            <button
              onClick={() => signInAs(actor.id)}
              disabled={pendingId !== null}
            >
              {actor.name}
              {actor.jobTitle ? ` — ${actor.jobTitle}` : ''}
            </button>
          </li>
        ))}
      </ul>
      {error ? <p role="alert">{error.message}</p> : null}
    </section>
  )
}
