import { asI18n } from '@pikku/react'
import type { Story, StoryMeta } from './csf.types'
import { Button } from './button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card'

export default {
  title: 'Card',
  component: Card,
  group: 'Display',
  description: 'A bordered surface that groups one idea: a header, content and optional actions.',
} satisfies StoryMeta

const Example = () => (
  <Card className="w-96">
    <CardHeader>
      <CardTitle>{asI18n('Invoice 1042')}</CardTitle>
      <CardDescription>{asI18n('Due 15 Jun 2026')}</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm">Three line items, 2 400 total.</p>
    </CardContent>
    <CardFooter className="justify-end gap-2">
      <Button variant="outline">{asI18n('Download')}</Button>
      <Button>{asI18n('Pay now')}</Button>
    </CardFooter>
  </Card>
)

export const Default: Story = { render: Example }
