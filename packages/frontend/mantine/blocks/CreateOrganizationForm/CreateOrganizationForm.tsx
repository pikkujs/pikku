import { useState } from 'react'
import {
  Alert,
  Button,
  Group,
  Paper,
  type PaperProps,
  Stack,
  TextInput,
  Title,
} from '@pikku/mantine/core'
import { useMutation } from '@tanstack/react-query'
import { m } from '@/i18n/messages'
import { asI18n } from '@pikku/react'
import { createOrganization } from './org-auth'

// slugify a display name → a url-safe org slug (Better Auth requires a unique slug).
const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

// Create a new organization from a name (slug auto-derived, still editable). Calls
// the Better Auth organization client; onCreated lets the page continue after.
export function CreateOrganizationForm({
  onCreated,
  ...props
}: PaperProps & { onCreated?: () => void }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)

  const create = useMutation({
    mutationFn: () => createOrganization({ name, slug: slug || slugify(name) }),
    onSuccess: () => onCreated?.(),
  })

  return (
    <Paper withBorder p="lg" radius="md" maw={420} {...props}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate()
        }}
      >
        <Stack gap="md">
          <Title order={4}>{m.createorganizationform__title()}</Title>
          <TextInput
            required
            label={m.createorganizationform__name_label()}
            placeholder={m.createorganizationform__name_placeholder()}
            value={name}
            onChange={(e) => {
              setName(e.currentTarget.value)
              if (!slugEdited) setSlug(slugify(e.currentTarget.value))
            }}
          />
          <TextInput
            required
            label={m.createorganizationform__slug_label()}
            value={slug}
            onChange={(e) => {
              setSlugEdited(true)
              setSlug(slugify(e.currentTarget.value))
            }}
          />
          {create.isError && (
            <Alert color="red" variant="light">
              {asI18n(create.error.message)}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button type="submit" loading={create.isPending}>
              {m.createorganizationform__submit()}
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  )
}
