import React from 'react'
import { Box, NavLink, Text, ThemeIcon } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Package } from 'lucide-react'
import { getCategoryMeta, type CategoryBucket } from './addonCategoryMeta'

interface CategoryRailProps {
  categories: CategoryBucket[]
  active: string
  total: number
  onPick: (id: string) => void
}

export const CategoryRail: React.FC<CategoryRailProps> = ({
  categories,
  active,
  total,
  onPick,
}) => {
  useLocale()
  return (
    <Box
      component="nav"
      style={{ position: 'sticky', top: 0, alignSelf: 'flex-start' }}
    >
      <Text
        size="xs"
        fw={700}
        tt="uppercase"
        c="dimmed"
        px="xs"
        mb={6}
        style={{ letterSpacing: '0.06em' }}
      >
        {m.packages_browse()}
      </Text>

      <NavLink
        active={active === 'all'}
        label={m.packages_all_addons()}
        leftSection={
          <ThemeIcon size={22} radius="sm" variant="light" color="gray">
            <Package size={14} />
          </ThemeIcon>
        }
        rightSection={
          <Text size="xs" c="dimmed" ff="monospace">
            {asI18n(String(total))}
          </Text>
        }
        onClick={() => onPick('all')}
        styles={{ root: { borderRadius: 'var(--mantine-radius-sm)' } }}
      />

      {categories.map((cat) => {
        const { icon: Icon, color } = getCategoryMeta(cat.id)
        return (
          <NavLink
            key={cat.id}
            active={active === cat.id}
            label={asI18n(cat.label)}
            leftSection={
              <ThemeIcon size={22} radius="sm" variant="light" color={color}>
                <Icon size={14} />
              </ThemeIcon>
            }
            rightSection={
              <Text size="xs" c="dimmed" ff="monospace">
                {asI18n(String(cat.count))}
              </Text>
            }
            onClick={() => onPick(cat.id)}
            styles={{ root: { borderRadius: 'var(--mantine-radius-sm)' } }}
          />
        )
      })}
    </Box>
  )
}
