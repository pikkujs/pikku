import { asI18n } from '@pikku/react'
import type { Story, StoryMeta } from './csf.types'
import { Alert, AlertDescription, AlertTitle } from './alert'

export default {
  title: 'Alert',
  component: Alert,
  group: 'Feedback',
  description: 'A callout for something the user must notice. Keep it to a title and one sentence.',
} satisfies StoryMeta

const Example = ({ variant }: { variant?: 'default' | 'destructive' }) => (
  <Alert variant={variant}>
    <AlertTitle>{asI18n('Heads up')}</AlertTitle>
    <AlertDescription>{asI18n('Your changes are saved as a draft.')}</AlertDescription>
  </Alert>
)

export const Default: Story = { render: Example }

export const Destructive: Story = { render: () => <Example variant="destructive" /> }
