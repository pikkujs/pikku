import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Anchor, Button, Code, CopyButton, Group, Loader, Stack, Text } from '@pikku/mantine/core'
import { Check, Cloud, Copy, ExternalLink, Rocket } from 'lucide-react'
import { asI18n, type I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'
import { CardsPage } from '../components/ui/CardsPage'
import { SectionCard } from '../components/ui/SectionCard'
import { openProjectKey, studioCall, useStudioAction } from './studio'

type PromptTarget = 'standalone' | 'cloudflare' | 'serverless' | 'azure'

interface PublishOptions {
  fabric: 'ready' | 'sign-in' | 'not-in-fabric'
  consoleUrl: string
  prompts: Record<PromptTarget, string>
}

interface PublishJob {
  state: 'idle' | 'running' | 'done' | 'failed'
  url: string | null
  error: string | null
  log: string[]
}

const usePublishOptions = (key: string) =>
  useQuery({ queryKey: ['studio', 'publish-options', key], queryFn: () => studioCall<PublishOptions>('publishOptions', { key }) })

const usePublishStatus = (key: string) =>
  useQuery({
    queryKey: ['studio', 'publish-status', key],
    queryFn: () => studioCall<PublishJob>('publishStatus', { key }),
    refetchInterval: (query) => (query.state.data?.state === 'running' ? 1500 : false),
  })

const FabricCard: React.FC<{ projectKey: string; options: PublishOptions }> = ({ projectKey, options }) => {
  const status = usePublishStatus(projectKey)
  const publish = useStudioAction<object, PublishJob>('publishToFabric')
  const job = status.data
  const running = publish.isPending || job?.state === 'running'
  const blurb =
    options.fabric === 'sign-in'
      ? m.studio_publish_fabric_sign_in()
      : options.fabric === 'not-in-fabric'
        ? m.studio_publish_fabric_not_in_fabric()
        : m.studio_publish_fabric_blurb()
  return (
    <SectionCard
      testId="studio-publish-fabric"
      title={m.studio_publish_fabric_title()}
      subtitle={m.studio_publish_recommended()}
      blurb={blurb}
      right={
        options.fabric === 'ready' ? (
          <Button
            leftSection={<Rocket size={16} />}
            loading={running}
            onClick={() => publish.mutate({ key: projectKey })}
            data-testid="studio-publish-fabric-go"
          >
            {m.studio_publish_fabric_action()}
          </Button>
        ) : (
          <Button component="a" href={options.consoleUrl} target="_blank" variant="default" leftSection={<Cloud size={16} />}>
            {m.studio_publish_open_fabric()}
          </Button>
        )
      }
    >
      {running && (
        <Group gap="sm" mt="md">
          <Loader size="xs" />
          <Text size="sm" c="dimmed">
            {job?.log.at(-1) ? asI18n(job.log.at(-1)!) : m.studio_publish_running()}
          </Text>
        </Group>
      )}
      {!running && job?.state === 'done' && (
        <Group gap="md" mt="md" data-testid="studio-publish-done">
          <Text size="sm">{m.studio_publish_done()}</Text>
          {job.url && (
            <Button component="a" href={job.url} target="_blank" size="xs" variant="light" rightSection={<ExternalLink size={12} />}>
              {asI18n(job.url)}
            </Button>
          )}
          <Anchor href={options.consoleUrl} target="_blank" size="sm">
            {m.studio_publish_manage_in_fabric()}
          </Anchor>
        </Group>
      )}
      {!running && (job?.state === 'failed' || publish.error) && (
        <Text size="sm" c="red" mt="md">
          {asI18n(job?.error ?? publish.error?.message ?? '')}
        </Text>
      )}
    </SectionCard>
  )
}

const PromptCard: React.FC<{
  target: PromptTarget
  title: I18nString
  blurb: I18nString
  prompt: string
}> = ({ target, title, blurb, prompt }) => {
  const [open, setOpen] = useState(false)
  return (
    <SectionCard
      testId={`studio-publish-${target}`}
      title={title}
      blurb={blurb}
      right={
        <CopyButton value={prompt}>
          {({ copied, copy }) => (
            <Button
              variant="default"
              leftSection={copied ? <Check size={16} /> : <Copy size={16} />}
              onClick={copy}
              data-testid={`studio-publish-${target}-copy`}
            >
              {copied ? m.common_copied() : m.studio_publish_copy_steps()}
            </Button>
          )}
        </CopyButton>
      }
    >
      <Stack gap="xs" mt="sm" align="flex-start">
        <Anchor component="button" size="sm" onClick={() => setOpen((o) => !o)} data-testid={`studio-publish-${target}-show`}>
          {open ? m.studio_publish_hide_steps() : m.studio_publish_show_steps()}
        </Anchor>
        {open && (
          <Code block w="100%" style={{ whiteSpace: 'pre-wrap' }}>
            {asI18n(prompt)}
          </Code>
        )}
      </Stack>
    </SectionCard>
  )
}

export const StudioPublishPage: React.FC = () => {
  const key = openProjectKey()
  const options = usePublishOptions(key ?? '')
  if (!key) return null
  return (
    <CardsPage>
      <SectionCard hero testId="studio-publish" title={m.studio_publish_title()} blurb={m.studio_publish_blurb()}>
        <Text size="sm" c="dimmed" mt="xs">
          {m.studio_publish_prompt_hint()}
        </Text>
      </SectionCard>
      {options.data && (
        <>
          <FabricCard projectKey={key} options={options.data} />
          <PromptCard
            target="standalone"
            title={m.studio_publish_standalone_title()}
            blurb={m.studio_publish_standalone_blurb()}
            prompt={options.data.prompts.standalone}
          />
          <PromptCard
            target="cloudflare"
            title={m.studio_publish_cloudflare_title()}
            blurb={m.studio_publish_cloudflare_blurb()}
            prompt={options.data.prompts.cloudflare}
          />
          <PromptCard
            target="serverless"
            title={m.studio_publish_serverless_title()}
            blurb={m.studio_publish_serverless_blurb()}
            prompt={options.data.prompts.serverless}
          />
          <PromptCard
            target="azure"
            title={m.studio_publish_azure_title()}
            blurb={m.studio_publish_azure_blurb()}
            prompt={options.data.prompts.azure}
          />
        </>
      )}
    </CardsPage>
  )
}
