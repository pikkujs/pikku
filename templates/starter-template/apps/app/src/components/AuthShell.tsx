import type { FC, ReactNode } from 'react'
import type { I18nNode, I18nString } from '@pikku/react'
import { Box, Flex, Stack, Text, Title } from '@pikku/mantine/core'
import { useLocale } from '@/i18n/config'
import { Wordmark } from './Wordmark'

// The CHROME shared by every auth screen — sign in, sign up, forgot password,
// reset password. Only the form in the middle differs, so the design lives here
// once: restyle this file and all four screens move together. Never re-create
// this frame inside a page; pass the form as children.
//
// Split layout: a branded panel carries the wordmark and the screen's
// description as its display line, the column on the right carries the title
// and the form. The panel is hidden below md, where the column takes both.
// Every colour is a theme token, so the panel recolours with the active theme.
type AuthShellProps = {
  appName: I18nString
  title: I18nString
  description: I18nString
  footer: I18nNode
  children: ReactNode
}

const ink = (percent: number) =>
  `color-mix(in srgb, var(--mantine-primary-color-contrast) ${percent}%, transparent)`

const panelBackground = [
  `radial-gradient(115% 85% at 6% 0%, color-mix(in srgb, var(--mantine-primary-color-filled) 82%, white) 0%, transparent 58%)`,
  `radial-gradient(95% 85% at 100% 100%, color-mix(in srgb, var(--mantine-primary-color-filled) 88%, black) 0%, transparent 62%)`,
  `linear-gradient(152deg, var(--mantine-primary-color-filled) 0%, color-mix(in srgb, var(--mantine-primary-color-filled) 92%, black) 100%)`,
].join(', ')

const meshMask = 'radial-gradient(105% 75% at 12% 8%, black 0%, transparent 72%)'
const bandMask = 'radial-gradient(140% 180% at 0% 0%, black 0%, transparent 88%)'

const styles = `
@keyframes auth-rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
.auth-rise { animation: auth-rise 620ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.auth-panel ::selection { background: ${ink(28)}; }
@media (prefers-reduced-motion: reduce) {
  .auth-rise { animation: none; }
}
`

export const AuthShell: FC<AuthShellProps> = (props) => {
  useLocale()

  return (
    <Flex mih="100vh" direction={{ base: 'column', md: 'row' }}>
      <style>{styles}</style>

      <Box
        className="auth-panel"
        visibleFrom="md"
        style={{
          flex: '1.05 1 0',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 'var(--mantine-spacing-xl)',
          padding: 'clamp(2rem, 3.5vw, 3.5rem)',
          color: 'var(--mantine-primary-color-contrast)',
          backgroundImage: panelBackground,
        }}
      >
        <Box
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `repeating-linear-gradient(90deg, ${ink(9)} 0 1px, transparent 1px 72px), repeating-linear-gradient(0deg, ${ink(9)} 0 1px, transparent 1px 72px)`,
            maskImage: meshMask,
            WebkitMaskImage: meshMask,
            pointerEvents: 'none',
          }}
        />

        <Box style={{ position: 'relative' }}>
          <Wordmark name={props.appName} size={34} />
        </Box>

        <Stack className="auth-rise" gap="lg" maw={480} style={{ position: 'relative' }}>
          <Box w={64} h={2} style={{ background: ink(45), borderRadius: 2 }} />
          <Title
            order={1}
            fz="clamp(2rem, 2.1vw + 1.1rem, 3rem)"
            fw={680}
            lh={1.08}
            style={{ letterSpacing: '-0.035em', textWrap: 'balance' }}
          >
            {props.description}
          </Title>
        </Stack>
      </Box>

      <Box
        hiddenFrom="md"
        style={{
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'flex-end',
          minHeight: 132,
          padding: 'var(--mantine-spacing-lg)',
          color: 'var(--mantine-primary-color-contrast)',
          backgroundImage: panelBackground,
        }}
      >
        <Box
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `repeating-linear-gradient(90deg, ${ink(9)} 0 1px, transparent 1px 72px), repeating-linear-gradient(0deg, ${ink(9)} 0 1px, transparent 1px 72px)`,
            maskImage: bandMask,
            WebkitMaskImage: bandMask,
            pointerEvents: 'none',
          }}
        />
        <Box style={{ position: 'relative' }}>
          <Wordmark name={props.appName} />
        </Box>
      </Box>

      <Box
        style={{
          flex: '1 1 0',
          display: 'grid',
          placeItems: 'center',
          padding: 'clamp(1.5rem, 4vw, 3rem)',
          background: 'var(--mantine-color-body)',
        }}
      >
        <Stack className="auth-rise" w="100%" maw={380} gap="lg">
          <Box>
            <Title order={2} fz={26} fw={660} lh={1.15} style={{ letterSpacing: '-0.03em' }}>
              {props.title}
            </Title>
            <Text c="dimmed" size="sm" mt={6} hiddenFrom="md">
              {props.description}
            </Text>
          </Box>

          {props.children}

          <Text ta="center" size="sm" c="dimmed">
            {props.footer}
          </Text>
        </Stack>
      </Box>
    </Flex>
  )
}
