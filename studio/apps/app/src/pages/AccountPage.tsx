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
import { initials } from '@/lib/initials'

type PasswordFormValues = { currentPassword: string; newPassword: string; confirmPassword: string }

const required = (value: string): I18nString | undefined =>
  value.trim() ? undefined : m.validation__required()

export const AccountPage: FC = () => {
  useLocale()

  const session = usePikkuQuery('getSession', {})

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
    <Box maw={520} w="100%" mx="auto">
      <Title order={1} fz={24} fw={650} style={{ letterSpacing: '-0.025em' }}>
        {m.account__title()}
      </Title>
      <Text c="dimmed" size="sm" mt={6} mb="lg" style={{ lineHeight: 1.55 }}>
        {m.account__description()}
      </Text>

      <Card withBorder radius="lg" shadow="sm" padding="xl">
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
                <Avatar size={24} radius="xl">
                  {asI18n(initials(session.data.name, session.data.email))}
                </Avatar>
                <Text size="sm">{asI18n(session.data.email)}</Text>
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
