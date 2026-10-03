import {
  ActionIcon,
  Anchor,
  Divider,
  Drawer,
  Group,
  ScrollArea,
  Stack,
  Text,
} from '@pikku/mantine/core'
import { ExternalLink, X } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePhone } from '../lib/breakpoints'
import { useConsoleChrome } from '../context/ConsoleChromeContext'
import { ConsoleSidePanel } from '../components/shell/ConsoleSidePanel'
import { HelpText } from './HelpText'
import type { HelpScreen } from './screens'

/**
 * Deliberately overlay-free: the panel explains the screen behind it and its
 * anchors ring controls out there, so a scrim would hide the thing being
 * pointed at.
 */
export function HelpPanel({
  screen,
  opened,
  onClose,
}: {
  screen: HelpScreen
  opened: boolean
  onClose: () => void
}) {
  useLocale()
  const phone = usePhone()
  const hosted = useConsoleChrome() === 'host'
  const content = (
    <Stack gap="md">
      <Text size="sm">
        <HelpText>{screen.what()}</HelpText>
      </Text>
      <Text size="sm">
        <HelpText>{screen.behaviour()}</HelpText>
      </Text>
      <Text size="sm">
        <HelpText>{screen.surprise()}</HelpText>
      </Text>
      <Text size="sm" c="dimmed">
        <HelpText>{screen.examples()}</HelpText>
      </Text>
      <Divider />
      <Stack gap={7}>
        <Text fz={10.5} fw={700} tt="uppercase" lts="0.07em" c="dimmed">
          {m.help_actions_title()}
        </Text>
        {screen.whatYouCanDo.map((line, i) => (
          <Group key={i} gap={7} wrap="nowrap" align="baseline">
            <Text c="dimmed" fz={13}>
              {asI18n('·')}
            </Text>
            <Text size="sm">
              <HelpText>{line()}</HelpText>
            </Text>
          </Group>
        ))}
      </Stack>
      {screen.docsHref && (
        <>
          <Divider />
          <Anchor
            href={screen.docsHref}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
          >
            <Group gap={6} wrap="nowrap">
              {m.help_read_more()}
              <ExternalLink size={13} />
            </Group>
          </Anchor>
        </>
      )}
    </Stack>
  )

  if (hosted && !phone) {
    if (!opened) return null
    return (
      <ConsoleSidePanel width={380} testId="help-panel">
        <Stack gap={0} style={{ height: '100%', minHeight: 0 }}>
          <Group
            justify="space-between"
            wrap="nowrap"
            px="lg"
            h={50}
            style={{ flexShrink: 0 }}
          >
            <Text fw={600}>{asI18n(screen.title())}</Text>
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label={m.common_close()}
              onClick={onClose}
              data-testid="help-close"
            >
              <X size={16} />
            </ActionIcon>
          </Group>
          <ScrollArea style={{ flex: 1 }} px="lg" pb="lg">
            {content}
          </ScrollArea>
        </Stack>
      </ConsoleSidePanel>
    )
  }

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position={phone ? 'bottom' : 'right'}
      size={phone ? '70%' : 360}
      withOverlay={false}
      lockScroll={false}
      trapFocus={false}
      title={asI18n(screen.title())}
      data-testid="help-panel"
    >
      {content}
    </Drawer>
  )
}
