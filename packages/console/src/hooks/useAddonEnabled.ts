import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'

/** The two addons the console's screens are served by. */
export type ConsoleAddon = 'console' | 'admin'

export type AddonState = 'checking' | 'enabled' | 'not-wired'

/**
 * Whether the addon behind a screen is actually wired into the app we are
 * talking to.
 *
 * The console UI is a static bundle the CLI serves at `/console`, so every
 * screen ships to every deployment — but `@pikku/addon-console` edits source
 * files and is normally only wired in development, and `@pikku/addon-admin` is
 * a deliberate opt-in. Without this the difference surfaced as whichever
 * request the screen happened to fire first failing on its own.
 *
 * The probe is each addon's `ping`, a function whose only job is to be found:
 * an unwired addon fails name resolution and comes back `RPCNotFoundError`
 * (404), which means exactly one thing. Anything else — 200, a 401 because the
 * host gated the addon, a 403, a network error — means the addon is there, or
 * that we cannot tell; either way the screen renders and reports its own
 * failure, because claiming "not installed" on a dropped connection would be
 * worse than the error it replaced.
 */
export const useAddonEnabled = (addon: ConsoleAddon): AddonState => {
  const rpc = usePikkuRPC()

  const { data, isPending } = useQuery<boolean>({
    queryKey: ['addon-enabled', addon],
    queryFn: async () => {
      try {
        if (addon === 'admin') {
          await rpc.invoke('admin:ping')
        } else {
          await rpc.invoke('console:ping')
        }
        return true
      } catch (e) {
        return (e as { name?: string })?.name !== 'RPCNotFoundError'
      }
    },
    // Wiring is a property of the running server, so it cannot change under a
    // session: asked once, kept for the life of the tab.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  })

  if (isPending) return 'checking'
  return data ? 'enabled' : 'not-wired'
}
