import React from 'react'
import { Box, Group } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { Link2 } from 'lucide-react'
import { PikkuBadge } from '../../../ui/PikkuBadge'
import { useFunctionMeta } from '../../../../hooks/useWirings'
import { usePanelContext } from '../../../../context/PanelContext'
import { SectionLabel } from './SectionLabel'

export const FunctionLink: React.FC<{
  pikkuFuncId?: string
  label?: string
}> = ({ pikkuFuncId, label }) => {
  const { data: funcMeta } = useFunctionMeta(pikkuFuncId ?? '')
  const { navigateInPanel } = usePanelContext()
  if (!pikkuFuncId) return null

  const displayName = funcMeta?.name || pikkuFuncId

  return (
    <Box>
      <SectionLabel>{asI18n(label || 'Handler Function')}</SectionLabel>
      <Group gap={6}>
        <PikkuBadge
          type="label"
          size="sm"
          variant="outline"
          color="gray"
          leftSection={<Link2 size={10} />}
          style={{ cursor: 'pointer' }}
          onClick={() =>
            navigateInPanel('function', pikkuFuncId, displayName, funcMeta)
          }
        >
          {asI18n(displayName)}
        </PikkuBadge>
      </Group>
    </Box>
  )
}
