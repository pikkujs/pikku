import React from 'react'
import { Stack, Text, Box, Group, Anchor } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { useLink } from '../../../router'
import { usePikkuMeta } from '../../../context/PikkuMetaContext'
import { PikkuBadge } from '../../ui/PikkuBadge'
import { wiringTypeColor } from '../../ui/badge-defs'
import classes from '../../ui/console.module.css'

const TYPE_HREF: Record<string, string> = {
  http: '/apis?tab=http',
  channel: '/apis?tab=channels',
  mcp: '/apis?tab=mcp',
  cli: '/apis?tab=cli',
  rpc: '/apis?tab=http',
  scheduler: '/jobs?tab=schedulers',
  queue: '/jobs?tab=queues',
  trigger: '/jobs?tab=triggers',
  triggerSource: '/jobs?tab=triggers',
}

export const FunctionCrossLinks: React.FC<{
  pikkuFuncId: string
}> = ({ pikkuFuncId }) => {
  const Link = useLink()
  const { functionUsedBy, meta } = usePikkuMeta()
  const usedBy = functionUsedBy.get(pikkuFuncId)

  const funcMeta = meta.functions?.find(
    (f: any) => f.pikkuFuncId === pikkuFuncId
  )
  const services = funcMeta?.services?.services as string[] | undefined

  if (!usedBy && !services?.length) return null

  return (
    <Stack gap="md" p="md">
      {usedBy && usedBy.transports.length > 0 && (
        <Box>
          <Text size="sm" fw={500} mb={4}>
            {asI18n('Wired To')}
          </Text>
          <Group gap={4} wrap="wrap">
            {usedBy.transports.map((t: any) => (
              <Anchor
                key={t.id}
                component={Link}
                to={TYPE_HREF[t.type] || '#'}
                underline="never"
              >
                <PikkuBadge
                  type="label"
                  size="sm"
                  color={wiringTypeColor(t.type)}
                  className={classes.clickableText}
                >
                  {asI18n(t.name)}
                </PikkuBadge>
              </Anchor>
            ))}
          </Group>
        </Box>
      )}
      {usedBy && usedBy.jobs.length > 0 && (
        <Box>
          <Text size="sm" fw={500} mb={4}>
            {asI18n('Jobs')}
          </Text>
          <Group gap={4} wrap="wrap">
            {usedBy.jobs.map((j: any) => (
              <Anchor
                key={j.id}
                component={Link}
                to={TYPE_HREF[j.type] || '#'}
                underline="never"
              >
                <PikkuBadge
                  type="label"
                  size="sm"
                  color={wiringTypeColor(j.type)}
                  className={classes.clickableText}
                >
                  {asI18n(j.name)}
                </PikkuBadge>
              </Anchor>
            ))}
          </Group>
        </Box>
      )}
      {services && services.length > 0 && (
        <Box>
          <Text size="sm" fw={500} mb={4}>
            {asI18n('Services')}
          </Text>
          <Group gap={4} wrap="wrap">
            {services.map((svc) => (
              <Anchor
                key={svc}
                component={Link}
                to="/runtime?tab=services"
                underline="never"
              >
                <PikkuBadge
                  type="label"
                  size="sm"
                  variant="outline"
                  color="gray"
                  className={classes.clickableText}
                >
                  {asI18n(svc)}
                </PikkuBadge>
              </Anchor>
            ))}
          </Group>
        </Box>
      )}
    </Stack>
  )
}

export const WiringCrossLinks: React.FC<{
  pikkuFuncId?: string
}> = ({ pikkuFuncId }) => {
  const Link = useLink()
  const { functionUsedBy, meta } = usePikkuMeta()

  if (!pikkuFuncId) return null

  const usedBy = functionUsedBy.get(pikkuFuncId)
  const funcMeta = meta.functions?.find(
    (f: any) => f.pikkuFuncId === pikkuFuncId
  )
  const services = funcMeta?.services?.services as string[] | undefined

  if (!usedBy && !services?.length) return null

  return (
    <Stack gap="md" p="md">
      <Anchor
        component={Link}
        to="/functions"
        size="sm"
        fw={500}
        underline="hover"
      >
        {asI18n(`Handler: ${pikkuFuncId}`)}
      </Anchor>
      {services && services.length > 0 && (
        <Box>
          <Text size="sm" fw={500} mb={4}>
            {asI18n('Services Used')}
          </Text>
          <Group gap={4} wrap="wrap">
            {services.map((svc) => (
              <Anchor
                key={svc}
                component={Link}
                to="/runtime?tab=services"
                underline="never"
              >
                <PikkuBadge
                  type="label"
                  size="sm"
                  variant="outline"
                  color="gray"
                  className={classes.clickableText}
                >
                  {asI18n(svc)}
                </PikkuBadge>
              </Anchor>
            ))}
          </Group>
        </Box>
      )}
      {usedBy && usedBy.transports.length > 1 && (
        <Box>
          <Text size="sm" fw={500} mb={4}>
            {asI18n('Also Wired To')}
          </Text>
          <Group gap={4} wrap="wrap">
            {usedBy.transports.map((t: any) => (
              <Anchor
                key={t.id}
                component={Link}
                to={TYPE_HREF[t.type] || '#'}
                underline="never"
              >
                <PikkuBadge
                  type="label"
                  size="sm"
                  color={wiringTypeColor(t.type)}
                  className={classes.clickableText}
                >
                  {asI18n(t.name)}
                </PikkuBadge>
              </Anchor>
            ))}
          </Group>
        </Box>
      )}
    </Stack>
  )
}
