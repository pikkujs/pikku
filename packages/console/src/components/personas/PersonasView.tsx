import React, { useState } from 'react'
import { Stack, Skeleton } from '@pikku/mantine/core'
import { UserRound } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { PersonaCard } from './PersonaCard'
import { PersonaDrawer } from './PersonaDrawer'
import type { PersonaEntry } from './persona-types'

type PersonasViewProps = {
  personas: PersonaEntry[]
  loading?: boolean
  onOpenFlow?: (name: string) => void
}

export const PersonasView: React.FC<PersonasViewProps> = ({
  personas,
  loading = false,
  onOpenFlow,
}) => {
  useLocale()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selected = personas.find((p) => p.key === selectedKey) ?? null

  if (loading) {
    return (
      <Stack gap={12} p="md">
        <Skeleton height={92} radius={14} />
        <Skeleton height={92} radius={14} />
      </Stack>
    )
  }

  if (personas.length === 0) {
    return (
      <EmptyStatePlaceholder
        icon={UserRound}
        title={m.personas_empty_title()}
        description={m.personas_empty_description()}
        docsHref="https://pikku.dev/docs/wiring/workflows"
      />
    )
  }

  return (
    <>
      <Stack gap={12}>
        {personas.map((p) => (
          <PersonaCard key={p.key} persona={p} onOpen={setSelectedKey} />
        ))}
      </Stack>
      <PersonaDrawer
        persona={selected}
        opened={selected !== null}
        onClose={() => setSelectedKey(null)}
        onOpenFlow={onOpenFlow}
      />
    </>
  )
}
