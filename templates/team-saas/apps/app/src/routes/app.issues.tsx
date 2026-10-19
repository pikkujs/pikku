import { createFileRoute } from '@tanstack/react-router'
import { IssuesRoutePage } from '@/pages/IssuesRoutePage'

/**
 * The organisation is part of the URL rather than ambient state. A workspace
 * switcher that lives only in memory is how somebody posts into the wrong
 * tenant after a browser restore.
 */
export const Route = createFileRoute('/app/issues')({
  validateSearch: (search: Record<string, unknown>) => ({
    orgId: String(search.orgId ?? ''),
  }),
  component: function IssuesRoute() {
    const { orgId } = Route.useSearch()
    return <IssuesRoutePage orgId={orgId} />
  },
})
