import { createFileRoute } from '@tanstack/react-router'
import { makeApi } from '../lib/pikku-start.gen'

export const Route = createFileRoute('/')({
  loader: async () => {
    const api = makeApi()
    return await api.invoke('helloRPC', { name: 'TanStack' })
  },
  component: Home,
})

function Home() {
  const data = Route.useLoaderData()
  return <main>{data.message}</main>
}
