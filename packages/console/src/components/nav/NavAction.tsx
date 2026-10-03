import { Text, UnstyledButton } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'

type NavActionProps = {
  icon: React.ReactNode
  label: I18nString
  onSelect: () => void
  disabled?: boolean
  testId?: string
}

export const NavAction: React.FC<NavActionProps> = ({
  icon,
  label,
  onSelect,
  disabled,
  testId,
}) => (
  <UnstyledButton
    onClick={onSelect}
    disabled={disabled}
    data-testid={testId}
    px={10}
    py={8}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      borderRadius: 6,
      color: 'var(--mantine-color-dimmed)',
      opacity: disabled ? 0.5 : 1,
    }}
  >
    {icon}
    <Text size="sm">{label}</Text>
  </UnstyledButton>
)
