import { Button, Stack, TextInput } from '@pikku/mantine/core'
import { asI18n } from '@/i18n/messages'
import type { Story, StoryMeta } from './csf.types'
import { AuthShell } from './AuthShell'

export default {
  title: 'AuthShell',
  component: AuthShell,
  group: 'Auth',
  description:
    'The frame every auth screen shares — sign in, sign up, forgot and reset password. Only the children change.',
  argTypes: {
    appName: { description: 'Wordmark above the card.' },
    title: { description: 'Card heading.' },
    description: { description: 'One line under the heading.' },
    footer: { description: 'Muted line below the card — usually a link to the other screen.' },
    children: { description: 'The form. The shell owns everything around it.', control: false },
  },
} satisfies StoryMeta

const base = {
  appName: asI18n('Acme'),
  footer: asI18n('New here? Create an account'),
}

export const SignIn: Story = {
  args: {
    ...base,
    title: asI18n('Welcome back'),
    description: asI18n('Sign in to continue.'),
    children: (
      <Stack gap="sm">
        <TextInput label={asI18n('Email')} placeholder={asI18n('you@acme.com')} />
        <Button fullWidth>{asI18n('Sign in')}</Button>
      </Stack>
    ),
  },
}

export const ForgotPassword: Story = {
  args: {
    ...base,
    title: asI18n('Reset your password'),
    description: asI18n('We will email you a link to choose a new one.'),
    children: (
      <Stack gap="sm">
        <TextInput label={asI18n('Email')} placeholder={asI18n('you@acme.com')} />
        <Button fullWidth>{asI18n('Send reset link')}</Button>
      </Stack>
    ),
  },
}
