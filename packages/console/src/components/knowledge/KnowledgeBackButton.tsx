import React from 'react'
import { Button, Group } from '@pikku/mantine/core'
import { ArrowLeft } from 'lucide-react'
import { m } from '@/i18n/messages'

export const KnowledgeBackButton: React.FC<{ onBack: () => void }> = ({
  onBack,
}) => (
  <Group>
    <Button
      variant="default"
      size="compact-sm"
      leftSection={<ArrowLeft size={14} />}
      onClick={onBack}
      data-testid="knowledge-back"
    >
      {m.knowledge_back()}
    </Button>
  </Group>
)
