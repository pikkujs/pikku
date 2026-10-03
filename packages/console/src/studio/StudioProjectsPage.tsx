import React, { useState } from 'react'
import { Button, Code, Group, Stack, Text, TextInput, Textarea } from '@pikku/mantine/core'
import { FolderPlus, Plus } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { CardsPage } from '../components/ui/CardsPage'
import { SectionCard } from '../components/ui/SectionCard'
import { CardRow } from '../components/ui/CardRow'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ConsoleLoading } from '../components/ui/ConsoleLoading'
import {
  enterProject,
  useStudioAccount,
  useStudioAction,
  useStudioProjects,
  useAiOptions,
  type AiChoice,
  type StudioProject,
} from './studio'

const ErrorLine: React.FC<{ error: Error | null }> = ({ error }) => {
  if (!error) return null
  const [first, ...rest] = error.message.split('\n')
  return (
    <Stack gap={4} data-testid="studio-error">
      <Text size="sm" c="red">
        {asI18n(first ?? '')}
      </Text>
      {rest.length > 0 && (
        <Code block mah={240} style={{ overflow: 'auto', whiteSpace: 'pre-wrap' }}>
          {asI18n(rest.join('\n'))}
        </Code>
      )}
    </Stack>
  )
}

const NewProject: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [name, setName] = useState('')
  const [idea, setIdea] = useState('')
  const create = useStudioAction<{ name: string; idea?: string }, StudioProject>('createProject')
  const open = useStudioAction<{ key: string }, unknown>('openProject')
  const busy = create.isPending || open.isPending
  const submit = () =>
    create.mutate(
      { name: name.trim(), idea: idea.trim() || undefined },
      {
        onSuccess: (project) =>
          open.mutate({ key: project.key }, { onSuccess: () => enterProject(project.key, 'requests') }),
      }
    )
  return (
    <SectionCard testId="studio-new-project" title={m.studio_new_title()} blurb={m.studio_new_blurb()}>
      <Stack gap="sm" mt="md">
        <TextInput
          label={m.studio_new_name()}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          data-autofocus
          data-testid="studio-new-name"
        />
        <Textarea
          label={m.studio_new_idea()}
          description={m.studio_new_idea_hint()}
          autosize
          minRows={3}
          value={idea}
          onChange={(e) => setIdea(e.currentTarget.value)}
          data-testid="studio-new-idea"
        />
        <ErrorLine error={create.error ?? open.error} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone} disabled={busy}>
            {m.studio_cancel()}
          </Button>
          <Button onClick={submit} disabled={!name.trim()} loading={busy} data-testid="studio-new-submit">
            {open.isPending ? m.studio_opening() : m.studio_new_submit()}
          </Button>
        </Group>
      </Stack>
    </SectionCard>
  )
}

const AddFolder: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [path, setPath] = useState('')
  const add = useStudioAction<{ path: string }, StudioProject>('addProject')
  return (
    <SectionCard testId="studio-add-folder" title={m.studio_add_title()} blurb={m.studio_add_blurb()}>
      <Stack gap="sm" mt="md">
        <TextInput
          label={m.studio_add_path()}
          placeholder={asI18n("~/code/my-app")}
          value={path}
          onChange={(e) => setPath(e.currentTarget.value)}
          data-autofocus
          data-testid="studio-add-path"
        />
        <ErrorLine error={add.error} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            {m.studio_cancel()}
          </Button>
          <Button
            onClick={() => add.mutate({ path: path.trim() }, { onSuccess: onDone })}
            disabled={!path.trim()}
            loading={add.isPending}
            data-testid="studio-add-submit"
          >
            {m.studio_add_submit()}
          </Button>
        </Group>
      </Stack>
    </SectionCard>
  )
}

const OUTDATED_DATABASE = /schema is not in this database/

const UpdateDatabase: React.FC<{ projectKey: string }> = ({ projectKey }) => {
  const update = useStudioAction<{ key: string }, unknown>('updateDatabase')
  return (
    <Stack gap={4} data-testid="studio-update-database">
      <Text size="sm">{m.studio_db_outdated()}</Text>
      <Group>
        <Button
          size="xs"
          loading={update.isPending}
          onClick={() => update.mutate({ key: projectKey }, { onSuccess: () => enterProject(projectKey) })}
          data-testid="studio-update-database-run"
        >
          {update.isPending ? m.studio_db_updating() : m.studio_db_update()}
        </Button>
      </Group>
      <ErrorLine error={update.error} />
    </Stack>
  )
}

const LocalRow: React.FC<{ project: StudioProject }> = ({ project }) => {
  const open = useStudioAction<{ key: string }, unknown>('openProject')
  const remove = useStudioAction<{ key: string }, unknown>('removeProject')
  return (
    <div data-testid="studio-project" data-name={project.name} data-location={project.location}>
      <CardRow
        title={asI18n(project.name)}
        badges={
          <>
            {project.location === 'both' && (
              <StatusBadge tone="info" size="sm">
                {m.studio_badge_in_fabric()}
              </StatusBadge>
            )}
            {project.open && (
              <StatusBadge tone="good" size="sm">
                {m.studio_badge_running()}
              </StatusBadge>
            )}
            {project.missing && (
              <StatusBadge tone="bad" size="sm">
                {m.studio_badge_missing()}
              </StatusBadge>
            )}
          </>
        }
        meta={asI18n(project.path ?? '')}
        trailing={
          <Group gap="xs" wrap="nowrap">
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              loading={remove.isPending}
              onClick={() => remove.mutate({ key: project.key })}
              data-testid="studio-project-remove"
              data-name={project.name}
            >
              {m.studio_remove()}
            </Button>
            <Button
              size="xs"
              disabled={project.missing}
              loading={open.isPending}
              onClick={() => open.mutate({ key: project.key }, { onSuccess: () => enterProject(project.key) })}
              data-testid="studio-project-open"
              data-name={project.name}
            >
              {open.isPending ? m.studio_opening() : m.studio_open()}
            </Button>
          </Group>
        }
      >
        <ErrorLine error={open.error} />
        {open.error && OUTDATED_DATABASE.test(open.error.message) && (
          <UpdateDatabase projectKey={project.key} />
        )}
      </CardRow>
    </div>
  )
}

const CloudRow: React.FC<{ project: StudioProject }> = ({ project }) => {
  const clone = useStudioAction<{ fabricProjectId: string }, StudioProject>('cloneProject')
  return (
    <div data-testid="studio-project" data-name={project.name} data-location="cloud">
      <CardRow
        title={asI18n(project.name)}
        meta={project.gitRepoUrl ? m.studio_cloud_meta() : m.studio_cloud_no_repo()}
        trailing={
          <Button
            size="xs"
            variant="default"
            disabled={!project.gitRepoUrl}
            loading={clone.isPending}
            onClick={() => clone.mutate({ fabricProjectId: project.fabricProjectId! })}
            data-testid="studio-project-clone"
            data-name={project.name}
          >
            {m.studio_clone()}
          </Button>
        }
      >
        <ErrorLine error={clone.error} />
      </CardRow>
    </div>
  )
}

export const StudioProjectsPage: React.FC = () => {
  const account = useStudioAccount()
  const projects = useStudioProjects()
  const signOut = useStudioAction<object, unknown>('signOut')
  const changeAi = useStudioAction<object, unknown>('changeAi')
  const options = useAiOptions()
  const [adding, setAdding] = useState<'new' | 'folder' | null>(null)

  if (projects.isLoading || account.isLoading) return <ConsoleLoading h="100vh" />

  const all = projects.data ?? []
  const local = all.filter((p) => p.location !== 'cloud')
  const cloud = all.filter((p) => p.location === 'cloud')
  const fabric = account.data?.signIn === 'fabric'

  return (
    <Stack p="md" py={48}>
      <CardsPage maw={880}>
        <SectionCard
          hero
          testId="studio-projects"
          title={m.studio_projects_title()}
          blurb={fabric ? m.studio_projects_blurb_fabric() : m.studio_projects_blurb_local()}
          right={
            <Group gap="xs">
              <Button
                variant="default"
                leftSection={<FolderPlus size={16} />}
                onClick={() => setAdding('folder')}
                data-testid="studio-add-open"
              >
                {m.studio_add_open()}
              </Button>
              <Button leftSection={<Plus size={16} />} onClick={() => setAdding('new')} data-testid="studio-new-open">
                {m.studio_new_open()}
              </Button>
            </Group>
          }
        />
        {adding === 'new' && <NewProject onDone={() => setAdding(null)} />}
        {adding === 'folder' && <AddFolder onDone={() => setAdding(null)} />}
        <SectionCard
          testId="studio-local"
          title={m.studio_local_section()}
          blurb={local.length ? m.studio_local_section_blurb() : m.studio_local_section_empty()}
        >
          <Stack gap="xs" mt={local.length ? 'md' : 0}>
            {local.map((project) => (
              <LocalRow key={project.key} project={project} />
            ))}
          </Stack>
        </SectionCard>
        {fabric && (
          <SectionCard
            testId="studio-cloud"
            title={m.studio_cloud_section()}
            blurb={cloud.length ? m.studio_cloud_section_blurb() : m.studio_cloud_section_empty()}
          >
            <Stack gap="xs" mt={cloud.length ? 'md' : 0}>
              {cloud.map((project) => (
                <CloudRow key={project.key} project={project} />
              ))}
            </Stack>
          </SectionCard>
        )}
        <SectionCard
          testId="studio-account"
          title={m.studio_account_title()}
          blurb={fabric ? m.studio_account_fabric({ url: account.data!.consoleUrl }) : m.studio_account_local()}
          right={
            <Button variant="default" loading={signOut.isPending} onClick={() => signOut.mutate({})} data-testid="studio-sign-out">
              {fabric ? m.studio_sign_out() : m.studio_change_sign_in()}
            </Button>
          }
        />
        <SectionCard
          testId="studio-ai"
          title={m.studio_ai_card_title()}
          blurb={aiSentence(account.data?.ai ?? null, options.data)}
          right={
            <Button variant="default" loading={changeAi.isPending} onClick={() => changeAi.mutate({})} data-testid="studio-ai-change">
              {m.studio_change_sign_in()}
            </Button>
          }
        />
      </CardsPage>
    </Stack>
  )
}

const aiSentence = (ai: AiChoice | null, options: ReturnType<typeof useAiOptions>['data']) => {
  if (!ai) return m.studio_ai_none()
  if (ai.kind === 'fabric') return m.studio_ai_is_fabric()
  if (ai.kind === 'subscription') {
    const name = options?.subscriptions.find((p) => p.id === ai.provider)?.name ?? ai.provider
    return m.studio_ai_is_subscription({ name })
  }
  const name = options?.keys.find((p) => p.id === ai.provider)?.name ?? ai.provider
  return m.studio_ai_is_key({ name, model: ai.model })
}
