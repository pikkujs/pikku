import { createFileRoute } from '@tanstack/react-router'
import { JournalPage } from '@/pages/JournalPage'

export const Route = createFileRoute('/app/journal')({
  component: JournalPage,
})
