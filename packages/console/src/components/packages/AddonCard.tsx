import React from 'react'
import {
  ActionIcon,
  Box,
  Stack,
  Text,
  ThemeIcon,
  VisuallyHidden,
} from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { ChevronRight } from 'lucide-react'
import { plainSummary, type PackageMeta } from './packageMeta'
import {
  getCategoryMeta,
  addonPrimaryCategory,
  isOfficialAddon,
} from './addonCategoryMeta'
import { addonJob } from './addonJobs'
import { CardRow } from '../ui/CardRow'
import { StatusBadge, type StatusTone } from '../ui/StatusBadge'

export interface AddonCardStatus {
  tone: StatusTone
  label: I18nNode
  next?: I18nNode
}

interface AddonCardProps {
  addon: PackageMeta
  installed: boolean
  kind?: 'addon' | 'api'
  status?: AddonCardStatus
  onOpen: (addon: PackageMeta) => void
}

export const AddonCard: React.FC<AddonCardProps> = ({
  addon,
  installed,
  kind = 'addon',
  status,
  onOpen,
}) => {
  useLocale()
  const isApi = kind === 'api'
  const { icon: CategoryIcon, color } = getCategoryMeta(
    addonPrimaryCategory(addon)
  )
  const official = !isApi && isOfficialAddon(addon.name)
  const iconSrc = addon.icon
    ? addon.icon.startsWith('<')
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(addon.icon)}`
      : addon.icon
    : null
  const name = addon.displayName || addon.name
  const job = isApi ? undefined : addonJob(addon.name)
  const summary =
    !job && addon.description ? plainSummary(addon.description) : ''
  const badge: AddonCardStatus | undefined =
    status ??
    (installed
      ? {
          tone: 'good',
          label: isApi ? m.packages_imported() : m.integrations_status_added(),
        }
      : undefined)

  return (
    <Box
      data-testid="addon-card"
      data-addon-package={addon.name}
      data-addon-installed={installed || undefined}
    >
      <CardRow
        onClick={() => onOpen(addon)}
        leading={
          iconSrc ? (
            <ThemeIcon size={36} radius="md" variant="default">
              <img
                src={iconSrc}
                width={24}
                height={24}
                alt=""
                style={{ objectFit: 'contain', display: 'block' }}
              />
            </ThemeIcon>
          ) : (
            <ThemeIcon size={36} radius="md" variant="light" color={color}>
              <CategoryIcon size={18} />
            </ThemeIcon>
          )
        }
        title={job ?? asI18n(name)}
        badges={
          badge && (
            <StatusBadge tone={badge.tone} size="sm">
              {badge.label}
            </StatusBadge>
          )
        }
        meta={
          <Stack gap={2}>
            {badge?.next ? (
              <Text fz={13.5} c="dimmed">
                {badge.next}
              </Text>
            ) : (
              summary && (
                <Text fz={13.5} c="dimmed" lineClamp={2}>
                  {asI18n(summary)}
                </Text>
              )
            )}
            {(official || (isApi && addon.author)) && (
              <Text fz={12} c="dimmed" truncate>
                {official
                  ? m.integrations_made_by_fabric()
                  : m.integrations_made_by({ author: addon.author })}
              </Text>
            )}
            <VisuallyHidden>{asI18n(addon.name)}</VisuallyHidden>
          </Stack>
        }
        trailing={
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={m.integrations_open({ name })}
            onClick={() => onOpen(addon)}
          >
            <ChevronRight size={16} />
          </ActionIcon>
        }
      />
    </Box>
  )
}
