import type { Story, StoryMeta } from './csf.types'
import { Button } from './button'
import { Input } from './input'
import { Label } from './label'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from './sheet'

export default {
  title: 'Sheet',
  component: Sheet,
  group: 'Overlays',
  description: 'A side panel for a form or detail view that should not take the user off the page.',
} satisfies StoryMeta

export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Edit profile</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit profile</SheetTitle>
          <SheetDescription>Changes apply when you save.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-1">
          <Label htmlFor="sheet-name">Name</Label>
          <Input id="sheet-name" />
        </div>
        <SheetFooter>
          <Button>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
}
