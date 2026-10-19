import { asI18n } from '@/i18n/messages'
import type { Story, StoryMeta } from './csf.types'
import { Wordmark } from './Wordmark'

export default {
  title: 'Wordmark',
  component: Wordmark,
  group: 'Branding',
  description: 'The app name set in type — the identity every auth screen and the shell share.',
  argTypes: {
    name: { description: 'App name (an i18n string).' },
    size: { description: 'Nominal size in px; the type is 0.62× this.' },
  },
} satisfies StoryMeta

export const Default: Story = { args: { name: asI18n('Acme') } }

export const Large: Story = { args: { name: asI18n('Acme'), size: 48 } }

export const LongName: Story = { args: { name: asI18n('Northwind Logistics') } }
