import { Outlet, createRootRoute } from '@tanstack/react-router'
import { Shell } from '@/blocks'

export const Route = createRootRoute({
  component: () => (
    <Shell name="Prototype" nav={[{ to: '/', label: 'Home' }]}>
      <Outlet />
    </Shell>
  ),
})
