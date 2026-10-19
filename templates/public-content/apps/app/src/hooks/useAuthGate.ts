import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { getAuthSession } from '@/lib/auth'

// Client-side auth gates. They run only after hydration (useEffect never fires
// during SSR), so the redirect decision never depends on the SSR worker seeing
// the session cookie — which it can't on the multi-tenant pikkufabric.dev
// domain, where the Auth.js cookie is host-only on the API origin and so is not
// sent to the app host on a server-rendered request. The client fetch to the
// API host does carry that cookie, so the check is correct on every deploy
// topology (local, platform subdomains, custom domain).
//
// Trade-off: a logged-out visitor to /app sees the shell for a moment before
// being redirected. On a custom domain (single tenant, cookie Domain=.<parent>)
// you could add a createServerFn + server-side gate to remove that flash —
// deferred; not safe to do generically on the shared platform domain.

export function useRedirectIfAuthenticated() {
  const navigate = useNavigate()
  useEffect(() => {
    let cancelled = false
    void getAuthSession().then((session) => {
      if (!cancelled && session.user?.email) {
        void navigate({ to: '/app' })
      }
    })
    return () => {
      cancelled = true
    }
  }, [navigate])
}

export function useRequireAuthentication() {
  const navigate = useNavigate()
  useEffect(() => {
    let cancelled = false
    void getAuthSession().then((session) => {
      if (!cancelled && !session.user?.email) {
        void navigate({ to: '/app/login' })
      }
    })
    return () => {
      cancelled = true
    }
  }, [navigate])
}
