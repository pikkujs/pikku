//~ name: ui-dev-sign-in
//~ title: Offer one-click sign-in as a declared persona while developing
//~ when: The app has a sign-in wall and every screen behind it is unreachable until somebody types a password — which is every new project, on the first day. Use this to get a working session in one click during development, and to let browser scenarios in as the persona they are written for. It renders nothing in production.
//~ entity: technician
//~ lang: tsx

//~ steps:
//~ The frontend is the small half. On Mantine, render `<DevActorSwitcher list={…}
//~ apiUrl={…} />` from `@pikku/mantine/dev` instead of this; otherwise drive
//~ `useDevActors` with your own markup, as here.
//~
//~ The server half is what goes missing, and neither failure errors:
//~ - `listDevActors`, an exposed sessionless function returning
//~   `listDevActors(personaList, app)` behind `devSwitcherOn` — see
//~   `src/functions/dev-actors.function.ts`. Without it the switcher lists nobody.
//~ - `personaSignIn` on `pikkuActor`, gated by the same `devSwitcherOn` call — see
//~   `src/auth.ts`. Without it every click 404s.
//~
//~ Only a persona's id and label reach the browser, so there is no credential to
//~ keep out of the production bundle.
// ===== FILE: src/components/dev-sign-in.tsx =====
import { useDevActors, usePikkuRPC } from '@pikku/react'
import type { PikkuRPC } from '../../../../.pikku/pikku-rpc.gen'

export const DevSignIn = () => {
  const rpc = usePikkuRPC<PikkuRPC>()
  const { actors, signInAs, isPending } = useDevActors({
    list: () => rpc.invoke('listDevActors', {}),
    apiUrl: '/api',
    //~ A full reload rather than a router push: everything on the page was
    //~ fetched as nobody.
    onSignedIn: () => window.location.assign('/'),
  })

  return actors.map((actor) => (
    <button
      key={actor.id}
      disabled={isPending}
      onClick={() => signInAs(actor.id)}
    >
      {actor.name}
    </button>
  ))
}
