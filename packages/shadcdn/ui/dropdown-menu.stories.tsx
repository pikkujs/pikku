import type { Story, StoryMeta } from './csf.types'
import { Button } from './button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from './dropdown-menu'

export default {
  title: 'Dropdown menu',
  component: DropdownMenu,
  group: 'Overlays',
  description: 'A menu of actions opened from a button. Use it for a short list of related actions, not for navigation.',
} satisfies StoryMeta

const Example = () => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline">Options</Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuLabel>Account</DropdownMenuLabel>
      <DropdownMenuItem>Profile</DropdownMenuItem>
      <DropdownMenuItem>Sign out</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)

export const Default: Story = { render: Example }
