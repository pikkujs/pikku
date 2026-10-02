import React, { useState } from 'react'
import { Button, Center, Code, Group, PasswordInput, Select, Stack, Text, TextInput } from '@pikku/mantine/core'
import { Cloud, KeyRound, Ticket } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { CardsPage } from '../components/ui/CardsPage'
import { SectionCard } from '../components/ui/SectionCard'
import { useAiOptions, useStudioAccount, useStudioAction, type AiChoice } from './studio'

type Choosing = 'key' | 'subscription' | null

const KeyForm: React.FC<{ onCancel: () => void }> = ({ onCancel }) => {
  const options = useAiOptions()
  const set = useStudioAction<object, AiChoice>('setAi')
  const [provider, setProvider] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const chosen = options.data?.keys.find((p) => p.id === provider)
  return (
    <SectionCard testId="studio-ai-key" title={m.studio_ai_key_title()} blurb={m.studio_ai_key_form_blurb()}>
      <Stack gap="sm" mt="md">
        <Select
          label={m.studio_ai_key_provider()}
          data={(options.data?.keys ?? []).map((p) => ({ value: p.id, label: p.name }))}
          value={provider}
          onChange={setProvider}
          data-testid="studio-ai-provider"
        />
        <PasswordInput
          label={m.studio_ai_key_value()}
          value={apiKey}
          onChange={(e) => setApiKey(e.currentTarget.value)}
          data-testid="studio-ai-api-key"
        />
        <TextInput
          label={m.studio_ai_key_model()}
          description={m.studio_ai_key_model_hint()}
          placeholder={chosen ? asI18n(chosen.model) : undefined}
          value={model}
          onChange={(e) => setModel(e.currentTarget.value)}
        />
        {set.error && (
          <Text size="sm" c="red">
            {asI18n(set.error.message)}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel}>
            {m.studio_back()}
          </Button>
          <Button
            disabled={!provider || !apiKey.trim()}
            loading={set.isPending}
            onClick={() => set.mutate({ kind: 'key', provider, apiKey, model: model || undefined })}
            data-testid="studio-ai-key-save"
          >
            {m.studio_ai_use_this()}
          </Button>
        </Group>
      </Stack>
    </SectionCard>
  )
}

const SubscriptionForm: React.FC<{ onCancel: () => void }> = ({ onCancel }) => {
  const options = useAiOptions()
  const set = useStudioAction<object, AiChoice>('setAi')
  const [provider, setProvider] = useState<string | null>(null)
  const chosen = options.data?.subscriptions.find((p) => p.id === provider)
  return (
    <SectionCard testId="studio-ai-subscription" title={m.studio_ai_sub_title()} blurb={m.studio_ai_sub_form_blurb()}>
      <Stack gap="sm" mt="md">
        <Select
          label={m.studio_ai_sub_which()}
          data={(options.data?.subscriptions ?? []).map((p) => ({ value: p.id, label: p.name }))}
          value={provider}
          onChange={setProvider}
          data-testid="studio-ai-subscription-provider"
        />
        {chosen && (
          <Stack gap={4}>
            <Text size="sm">{m.studio_ai_sub_steps()}</Text>
            <Code block>{asI18n(`pi\n/login\n→ ${chosen.piLogin}`)}</Code>
          </Stack>
        )}
        <Text size="xs" c="dimmed">
          {m.studio_ai_sub_claude_note()}
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel}>
            {m.studio_back()}
          </Button>
          <Button
            disabled={!provider}
            loading={set.isPending}
            onClick={() => set.mutate({ kind: 'subscription', provider })}
            data-testid="studio-ai-subscription-save"
          >
            {m.studio_ai_sub_done()}
          </Button>
        </Group>
      </Stack>
    </SectionCard>
  )
}

export const StudioChooseAi: React.FC = () => {
  const account = useStudioAccount()
  const set = useStudioAction<object, AiChoice>('setAi')
  const signOut = useStudioAction<object, unknown>('signOut')
  const [choosing, setChoosing] = useState<Choosing>(null)
  const fabric = account.data?.signIn === 'fabric'
  return (
    <Center mih="100vh" p="md">
      <CardsPage maw={720}>
        <SectionCard hero testId="studio-choose-ai" title={m.studio_ai_title()} blurb={m.studio_ai_blurb()} />
        {choosing === 'key' && <KeyForm onCancel={() => setChoosing(null)} />}
        {choosing === 'subscription' && <SubscriptionForm onCancel={() => setChoosing(null)} />}
        {!choosing && (
          <>
            <SectionCard
              testId="studio-ai-choose-key"
              title={m.studio_ai_key_title()}
              blurb={m.studio_ai_key_blurb()}
              right={
                <Button leftSection={<KeyRound size={16} />} variant="default" onClick={() => setChoosing('key')} data-testid="studio-ai-key-open">
                  {m.studio_ai_key_action()}
                </Button>
              }
            />
            <SectionCard
              testId="studio-ai-choose-subscription"
              title={m.studio_ai_sub_title()}
              blurb={m.studio_ai_sub_blurb()}
              right={
                <Button leftSection={<Ticket size={16} />} variant="default" onClick={() => setChoosing('subscription')} data-testid="studio-ai-subscription-open">
                  {m.studio_ai_sub_action()}
                </Button>
              }
            />
            <SectionCard
              testId="studio-ai-choose-fabric"
              title={m.studio_ai_fabric_title()}
              blurb={fabric ? m.studio_ai_fabric_blurb_signed_in() : m.studio_ai_fabric_blurb()}
              right={
                fabric ? (
                  <Button leftSection={<Cloud size={16} />} loading={set.isPending} onClick={() => set.mutate({ kind: 'fabric' })} data-testid="studio-ai-fabric">
                    {m.studio_ai_fabric_action()}
                  </Button>
                ) : (
                  <Button leftSection={<Cloud size={16} />} variant="default" loading={signOut.isPending} onClick={() => signOut.mutate({})} data-testid="studio-ai-fabric-sign-in">
                    {m.studio_fabric_choice_action()}
                  </Button>
                )
              }
            />
          </>
        )}
      </CardsPage>
    </Center>
  )
}
