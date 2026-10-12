//~ name: ui-dev-sign-in
//~ title: Offer one-click sign-in as a declared persona while developing
//~ when: The app has a sign-in wall and every screen behind it is unreachable until somebody types a password — which is every new project, on the first day. Use this to get a working session in one click during development, and to let browser scenarios in as the persona they are written for. It renders nothing in production.
//~ entity: technician
//~ lang: tsx

//~ steps:
//~ Drive `useDevActors` with your own markup, as here, or copy the starter
//~ template's `<DevActorSwitcher />`.
//~
//~ The server half is `personaSignIn` on `pikkuActor` — see `src/auth.ts`. It
//~ serves both the list and the sign-in, so without it the switcher silently
//~ lists nobody. Pass it `featureFlags` so a stage can turn it on.
//~
//~ Only a persona's id and label reach the browser, so there is no credential to
//~ keep out of the production bundle.
// ===== FILE: src/components/dev-sign-in.tsx =====
import { useDevActors } from '@pikku/react'

export const DevSignIn = () => {
  const { actors, signInAs, isPending } = useDevActors({
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
