import React from 'react'
import { Box, ScrollArea, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type { FeatureDoc } from './scenario-doc-model'

type FeatureNavigatorProps = {
  features: FeatureDoc[]
  selectedId?: string
  onSelect: (id: string) => void
}

export const FeatureNavigator: React.FC<FeatureNavigatorProps> = ({
  features,
  selectedId,
  onSelect,
}) => (
  <ScrollArea style={{ height: '100%' }} data-testid="feature-navigator">
    <Stack gap={2} p="xs">
      {features.length === 0 && (
        <Text size="sm" c="dimmed" p="sm">
          {m.scenarios_no_features()}
        </Text>
      )}
      {features.map((feature) => {
        const selected = feature.id === selectedId
        return (
          <Box
            key={feature.id}
            data-testid={`feature-nav-${feature.id}`}
            onClick={() => onSelect(feature.id)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              cursor: 'pointer',
              background: selected
                ? 'var(--mantine-color-default-hover)'
                : 'transparent',
            }}
          >
            <Text size="sm" fw={selected ? 600 : 500} lineClamp={1}>
              {asI18n(feature.name)}
            </Text>
            <Text size="xs" c="dimmed" ff="monospace">
              {feature.scenarios.length === 1
                ? m.scenarios_scenario_count_one()
                : m.scenarios_scenario_count({
                    count: feature.scenarios.length,
                  })}
            </Text>
          </Box>
        )
      })}
    </Stack>
  </ScrollArea>
)
