import type { Story, StoryMeta } from './csf.types'
import { Avatar, AvatarFallback } from './avatar'

export default {
  title: 'Avatar',
  component: Avatar,
  group: 'Display',
  description: 'A person or organisation, as an image with initials as the fallback.',
} satisfies StoryMeta

export const Fallback: Story = {
  render: () => (
    <Avatar>
      <AvatarFallback>YF</AvatarFallback>
    </Avatar>
  ),
}
