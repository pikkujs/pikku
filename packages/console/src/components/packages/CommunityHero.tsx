import React from 'react'
import { Paper, Group, Text, Title, ThemeIcon } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import type { I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Sparkles, Package, Building2, ShieldCheck } from 'lucide-react'

interface CommunityHeroProps {
  addonCount: number
  publisherCount: number
  officialCount: number
}

const HeroStat: React.FC<{
  icon: React.ComponentType<{ size?: number }>
  value: number
  label: I18nNode
}> = ({ icon: Icon, value, label }) => (
  <Group gap={7} wrap="nowrap">
    <Icon size={15} />
    <Text size="sm" fw={700} ff="monospace">
      {asI18n(String(value))}
    </Text>
    <Text size="sm" c="dimmed">
      {label}
    </Text>
  </Group>
)

export const CommunityHero: React.FC<CommunityHeroProps> = ({
  addonCount,
  publisherCount,
  officialCount,
}) => {
  useLocale()
  return (
    <Paper
      withBorder
      radius="md"
      px="lg"
      py="md"
      style={{
        background:
          'linear-gradient(135deg, var(--mantine-color-default) 0%, var(--mantine-color-default-hover) 100%)',
      }}
    >
      <Group justify="space-between" align="center" wrap="wrap" gap="md">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon size="lg" radius="md" variant="light" color="blue">
            <Sparkles size={18} />
          </ThemeIcon>
          <div style={{ minWidth: 0 }}>
            <Title order={4} fw={700} lh={1.2}>
              {m.packages_community_headline()}
            </Title>
            <Text size="sm" c="dimmed" lineClamp={1}>
              {m.packages_community_subtext()}
            </Text>
          </div>
        </Group>

        <Group gap="lg" wrap="nowrap">
          <HeroStat
            icon={Package}
            value={addonCount}
            label={m.packages_stat_addons()}
          />
          <HeroStat
            icon={Building2}
            value={publisherCount}
            label={m.packages_stat_publishers()}
          />
          <HeroStat
            icon={ShieldCheck}
            value={officialCount}
            label={m.packages_stat_official()}
          />
        </Group>
      </Group>
    </Paper>
  )
}
