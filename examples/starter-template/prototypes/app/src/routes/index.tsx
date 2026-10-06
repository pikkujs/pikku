import { createFileRoute } from '@tanstack/react-router'
import { EmptyState, PageHeader } from '@/blocks'

export const Route = createFileRoute('/')({
  component: () => (
    <>
      <PageHeader title="Your prototype" text="Screens appear here as they are made." />
      <EmptyState title="Nothing here yet" text="Tell Pikku which screens to sketch first." />
    </>
  ),
})
