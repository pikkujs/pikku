import React from 'react'
import {
  Paper,
  Stack,
  Group,
  Text,
  Title,
  ThemeIcon,
} from '@pikku/mantine/core'
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
      radius="lg"
      p="xl"
      style={{
        background:
          'linear-gradient(135deg, var(--mantine-color-default) 0%, var(--mantine-color-default-hover) 100%)',
      }}
    >
      <Stack gap="sm" style={{ maxWidth: 680 }}>
        <Group gap={6} wrap="nowrap">
          <ThemeIcon size="sm" radius="sm" variant="transparent" color="blue">
            <Sparkles size={15} />
          </ThemeIcon>
          <Text
            size="xs"
            fw={700}
            tt="uppercase"
            c="blue"
            style={{ letterSpacing: '0.06em' }}
          >
            {m.packages_community_eyebrow()}
          </Text>
        </Group>

        <Title order={2} fw={700} lh={1.15}>
          {m.packages_community_headline()}
        </Title>

        <Text size="sm" c="dimmed">
          {m.packages_community_subtext()}
        </Text>

        <Group gap="xl" mt={4}>
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
      </Stack>
    </Paper>
  )
}
