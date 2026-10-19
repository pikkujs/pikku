import type { FC } from 'react'
import type { I18nString } from '@pikku/react'
import { useForm } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import {
  Avatar,
  Box,
  Button,
  Card,
  Divider,
  Group,
  PasswordInput,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@pikku/mantine/core'
import { usePikkuQuery } from '@project/functions-sdk/pikku/api.gen'
import { m, asI18n } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { changePassword } from '@/lib/auth'

type PasswordFormValues = { currentPassword: string; newPassword: string; confirmPassword: string }

const required = (value: string): I18nString | undefined =>
  value.trim() ? undefined : m.validation__required()

const initials = (name: string | null, email: string): string => {
  const source = name?.trim() || email.split('@')[0] || '?'
  const parts = source.split(/\s+/).filter(Boolean)
  const chars =
    parts.length > 1 ? `${parts[0]![0]}${parts[parts.length - 1]![0]}` : source.slice(0, 2)
  return chars.toUpperCase()
}

export const AccountPage: FC = () => {
  useLocale()

  const session = usePikkuQuery('getSession', {})
  // The stored row, not the session claims. `getSession` reports who the
  // request is authenticated as; this reports what the account record actually
  // says — which is the thing an account page is for, and which nothing could
  // read because the function was never wired.
  const profile = usePikkuQuery('getProfile', null)

  const passwordMutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }: PasswordFormValues) =>
      changePassword(currentPassword, newPassword),
    onSuccess: () => form.reset(),
  })

  const form = useForm({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    } as PasswordFormValues,
    onSubmit: ({ value }) => passwordMutation.mutate(value),
  })

  return (
    <Box w="100%">
      <Title order={1} fz={30} fw={650} style={{ letterSpacing: '-0.02em' }}>
        {m.account__title()}
      </Title>
      <Text c="dimmed" size="sm" mt={6} mb="lg" style={{ lineHeight: 1.55 }}>
        {m.account__description()}
      </Text>

      {/* The narrow measure belongs to the form, not the page. Applied to the
          wrapper it also centred the heading, so Account was the one screen
          whose h1 sat somewhere different from every other screen's. */}
      <Card withBorder radius="lg" shadow="sm" padding="xl" maw={520}>
        <Stack gap="md">
          <Stack gap={6}>
            <Text size="sm" fw={550}>
              {m.account__signed_in_as()}
            </Text>
            {session.isPending ? (
              <Skeleton height={42} radius="md" />
            ) : session.data ? (
              <Group
                gap={10}
                px="sm"
                h={42}
                wrap="nowrap"
                style={{
                  borderRadius: 'var(--mantine-radius-md)',
                  border: '1px solid var(--mantine-color-default-border)',
                  background: 'var(--mantine-color-default-hover)',
                }}
              >
                <Avatar size={24} radius="xl" style={{ flexShrink: 0 }}>
                  {asI18n(initials(session.data.name, session.data.email))}
                </Avatar>
                {/* `truncate` and a shrinkable box, because the seeded persona
                    flatters this. `visitor@actors.local` is 20 characters and at
                    320px the box holds 23, so a real
                    `firstname.lastname@company.com` overruns it — and without
                    these the overrun is silent: the Group has `overflow: visible`
                    and the Text does not wrap, so the address simply runs past
                    the border with no ellipsis to admit it. The title attribute
                    keeps the full address reachable. */}
                <Text size="sm" truncate="end" style={{ minWidth: 0 }} title={asI18n(session.data.email)}>
                  {asI18n(session.data.email)}
                </Text>
                {profile.data?.role && (
                  <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                    {m.account__role({ role: profile.data.role })}
                  </Text>
                )}
              </Group>
            ) : (
              <Text c="red" size="sm">
                {m.account__error()}
              </Text>
            )}
          </Stack>

          <Divider />

          <form
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void form.handleSubmit()
            }}
          >
            <Stack gap="sm">
              <form.Field
                name="currentPassword"
                validators={{ onChange: ({ value }) => required(value) }}
              >
                {(field) => (
                  <PasswordInput
                    label={m.account__current_password()}
                    placeholder={m.common__password_placeholder()}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
                    onBlur={field.handleBlur}
                    error={field.state.meta.errors[0] as I18nString | undefined}
                    autoComplete="current-password"
                  />
                )}
              </form.Field>

              <form.Field
                name="newPassword"
                validators={{ onChange: ({ value }) => required(value) }}
              >
                {(field) => (
                  <PasswordInput
                    label={m.account__new_password()}
                    placeholder={m.common__password_placeholder()}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
                    onBlur={field.handleBlur}
                    error={field.state.meta.errors[0] as I18nString | undefined}
                    autoComplete="new-password"
                  />
                )}
              </form.Field>

              <form.Field
                name="confirmPassword"
                validators={{
                  onChangeListenTo: ['newPassword'],
                  onChange: ({ value, fieldApi }) => {
                    if (!value.trim()) return m.validation__required()
                    return value === fieldApi.form.getFieldValue('newPassword')
                      ? undefined
                      : m.account__password_mismatch()
                  },
                }}
              >
                {(field) => (
                  <PasswordInput
                    label={m.account__confirm_password()}
                    placeholder={m.common__password_placeholder()}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
                    onBlur={field.handleBlur}
                    error={field.state.meta.errors[0] as I18nString | undefined}
                    autoComplete="new-password"
                  />
                )}
              </form.Field>

              {passwordMutation.error ? (
                <Text c="red" size="sm">
                  {m.account__password_error()}
                </Text>
              ) : null}
              {passwordMutation.isSuccess ? (
                <Text c="green" size="sm">
                  {m.account__password_updated()}
                </Text>
              ) : null}

              <Button type="submit" loading={passwordMutation.isPending} fullWidth mt={2}>
                {m.account__update_password()}
              </Button>
            </Stack>
          </form>
        </Stack>
      </Card>
    </Box>
  )
}
