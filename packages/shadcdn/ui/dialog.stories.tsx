import { asI18n } from '@pikku/react'
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
        <Button variant="outline">{asI18n('Delete project')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{asI18n('Delete this project?')}</DialogTitle>
          <DialogDescription>{asI18n('This removes its files and cannot be undone.')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="destructive">{asI18n('Delete')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}
