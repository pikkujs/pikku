import { Text } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'

type NavHeadingProps = {
  children: I18nString
  /** A group's question rather than a section's name: one step quieter and one
   *  step smaller, so the two levels read as a hierarchy and not as two lists. */
  dim?: boolean
}

export const NavHeading: React.FC<NavHeadingProps> = ({ children, dim }) => (
  <Text
    px={16}
    pt={dim ? 6 : 8}
    pb={2}
    size="xs"
    fw={600}
    c={dim ? 'var(--app-text-dim)' : undefined}
    style={{
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      fontSize: dim ? 10 : 11,
      opacity: dim ? 0.75 : 1,
    }}
  >
    {children}
  </Text>
)
