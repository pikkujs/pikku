//~ name: ui-dev-sign-in
//~ title: Offer one-click sign-in as a declared persona while developing
//~ when: The app has a sign-in wall and every screen behind it is unreachable until somebody types a password — which is every new project, on the first day. Use this to get a working session in one click during development, and to let browser scenarios in as the persona they are written for. It renders nothing in production.
//~ entity: technician
//~ lang: tsx

//~ steps:
//~ The hook returns an empty actor list unless the host supplied BOTH the personas and
//~ their credentials, so a production bundle renders nothing without you testing for it.
//~ Gate the env reads on the dev flag anyway — that is what keeps a credential out of the
//~ production bundle in the first place, and this is the second line of defence, not the
//~ first.
// ===== FILE: src/components/dev-sign-in.tsx =====
import { useDevActors } from '@pikku/react'

export const DevSignIn = () => {
  const { actors, signInAs, pendingEmail, error } = useDevActors({
    //~ Spelled for the bundler you are on. This package deliberately does not
    //~ read env itself: `import.meta.env` under Vite, `process.env.NEXT_PUBLIC_*`
    //~ under Next, and a package that guesses gets it wrong for half its users.
    actors: import.meta.env.DEV ? import.meta.env.VITE_DEV_ACTORS : undefined,
    secrets: import.meta.env.DEV
      ? import.meta.env.VITE_DEV_ACTOR_SECRETS
      : undefined,
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
          <li key={actor.email}>
            <button
              onClick={() => signInAs(actor.email)}
              disabled={pendingEmail !== null}
            >
              {actor.name} — {actor.jobTitle}
            </button>
          </li>
        ))}
      </ul>
      {error ? <p role="alert">{error.message}</p> : null}
    </section>
  )
}
