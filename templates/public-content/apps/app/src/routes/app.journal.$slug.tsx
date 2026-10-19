import { createFileRoute } from '@tanstack/react-router'
import { PostPage } from '@/pages/PostPage'

export const Route = createFileRoute('/app/journal/$slug')({
  component: function PostRoute() {
    const { slug } = Route.useParams()
    return <PostPage slug={slug} />
  },
})
