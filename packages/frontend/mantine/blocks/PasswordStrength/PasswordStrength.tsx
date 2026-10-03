import type { I18nString } from '@pikku/react'
import { Check, X } from 'lucide-react'
import { Box, Center, Group, PasswordInput, Progress, Text } from '@pikku/mantine/core'
import { useInputState } from '@mantine/hooks'
import { m } from '@/i18n/messages'

function PasswordRequirement({ meets, label }: { meets: boolean; label: I18nString }) {
  return (
    <Text component="div" c={meets ? 'teal' : 'red'} mt={5} size="sm">
      <Center inline>
        {meets ? <Check size={14} strokeWidth={1.5} /> : <X size={14} strokeWidth={1.5} />}
        <Box ml={7}>{label}</Box>
      </Center>
    </Text>
  )
}

// Labels are UI copy (m.*); the regex is the validation rule.
const requirements = [
  { re: /[0-9]/, label: m.passwordstrength__includes_number },
  { re: /[a-z]/, label: m.passwordstrength__includes_lowercase },
  { re: /[A-Z]/, label: m.passwordstrength__includes_uppercase },
  { re: /[$&+,:;=?@#|'<>.^*()%!-]/, label: m.passwordstrength__includes_symbol },
]

function getStrength(password: string) {
  let multiplier = password.length > 5 ? 0 : 1

  requirements.forEach((requirement) => {
    if (!requirement.re.test(password)) {
      multiplier += 1
    }
  })

  return Math.max(100 - (100 / (requirements.length + 1)) * multiplier, 0)
}

export function PasswordStrength() {
  const [value, setValue] = useInputState('')
  const strength = getStrength(value)
  const checks = requirements.map((requirement, index) => (
    <PasswordRequirement
      key={index}
      label={requirement.label()}
      meets={requirement.re.test(value)}
    />
  ))
  const bars = Array(4)
    .fill(0)
    .map((_, index) => (
      <Progress
        styles={{ section: { transitionDuration: '0ms' } }}
        value={
          value.length > 0 && index === 0 ? 100 : strength >= ((index + 1) / 4) * 100 ? 100 : 0
        }
        color={strength > 80 ? 'teal' : strength > 50 ? 'yellow' : 'red'}
        key={index}
        size={4}
        aria-label={`${m.passwordstrength__strength_segment()} ${index + 1}`}
      />
    ))

  return (
    <div>
      <PasswordInput
        value={value}
        onChange={setValue}
        placeholder={m.passwordstrength__placeholder()}
        label={m.passwordstrength__label()}
        required
      />

      <Group gap={5} grow mt="xs" mb="md">
        {bars}
      </Group>

      <PasswordRequirement label={m.passwordstrength__has_min_chars()} meets={value.length > 5} />
      {checks}
    </div>
  )
}
