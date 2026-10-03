import type { Story, StoryMeta } from './csf.types'
import { Button } from './button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './dialog'

export default {
  title: 'Dialog',
  component: Dialog,
  group: 'Overlays',
  description: 'A blocking question that needs an answer before the user continues. Not for forms: those get a page or a sheet.',
} satisfies StoryMeta

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Delete project</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this project?</DialogTitle>
          <DialogDescription>This removes its files and cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="destructive">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}
