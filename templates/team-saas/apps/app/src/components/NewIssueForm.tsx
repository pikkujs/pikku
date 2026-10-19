import { useState, type FC } from 'react'
import { Alert, Button, Card, Group, Select, Stack, Text, TextInput } from '@pikku/mantine/core'
import { usePikkuQuery, usePikkuMutation } from '@project/functions-sdk/pikku/api.gen'
import { issuePriority } from '@/i18n/i18n-enum.gen'
import type { IssuePriorityKey } from '@/i18n/i18n-enum.gen'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

const PRIORITIES: IssuePriorityKey[] = ['low', 'normal', 'high', 'urgent']

type Props = {
  orgId: string
  onRaised: () => void
}

/**
 * Raising an issue, which the board could not do.
 *
 * The project is selected rather than typed because `createIssue` takes a
 * `projectId` and the board only ever rendered `projectKey` — a label. That gap
 * is why the function was reachable from a test and from nowhere else.
 *
 * Inline on the board rather than behind a route: filing an issue is a sentence
 * and a project, and sending somebody to a separate page to write one sentence
 * is how backlogs stop getting filed.
 */
export const NewIssueForm: FC<Props> = ({ orgId, onRaised }) => {
  useLocale()
  const projects = usePikkuQuery('listProjects', { orgId, includeArchived: false })
  const createIssue = usePikkuMutation('createIssue')

  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [priority, setPriority] = useState<string>('normal')
  const [failed, setFailed] = useState(false)

  const options = (projects.data?.projects ?? []).map((project) => ({
    value: project.projectId,
    label: `${project.key} · ${project.name}`,
  }))
  const chosen = projectId ?? options[0]?.value ?? null

  const raise = async () => {
    if (!title.trim() || !chosen) return
    setFailed(false)
    try {
      await createIssue.mutateAsync({
        orgId,
        projectId: chosen,
        title: title.trim(),
        priority: priority as 'low' | 'normal' | 'high' | 'urgent',
      })
      setTitle('')
      onRaised()
    } catch {
      setFailed(true)
    }
  }

  return (
    <Card withBorder radius="md" padding="md">
      <Stack gap="sm">
        <Text fw={600}>{m.issues__new_title()}</Text>
        <TextInput
          placeholder={m.issues__new_summary()}
          aria-label={m.issues__new_summary()}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void raise()
          }}
        />
        <Group grow align="flex-end">
          <Select
            label={m.issues__new_project()}
            data={options}
            value={chosen}
            onChange={setProjectId}
            allowDeselect={false}
          />
          <Select
            label={m.issues__new_priority()}
            // The generated enum labels, not four English strings wrapped in
            // `asI18n`. `asI18n` passes a runtime *value* through the i18n gate;
            // a literal inside it is untranslatable copy that the gate was built
            // to keep out — and these four already have message keys.
            data={PRIORITIES.map((value) => ({ value, label: issuePriority[value]() }))}
            value={priority}
            onChange={(value) => setPriority(value ?? 'normal')}
            allowDeselect={false}
          />
        </Group>

        {failed && (
          <Alert color="red" variant="light">
            {m.issues__new_failed()}
          </Alert>
        )}

        <Button
          loading={createIssue.isPending}
          disabled={!title.trim() || !chosen}
          onClick={() => void raise()}
        >
          {m.issues__new_submit()}
        </Button>
      </Stack>
    </Card>
  )
}
