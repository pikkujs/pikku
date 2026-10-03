import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { m } from '@/i18n/messages'

export function PasswordStrength() {
  const [value, setValue] = useState('')
  const checks = [
    { label: m.passwordstrength__r1(), met: value.length >= 8 },
    { label: m.passwordstrength__r2(), met: /\d/.test(value) },
    { label: m.passwordstrength__r3(), met: /[A-Z]/.test(value) },
  ]
  return (
    <div className="flex max-w-sm flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="strength-password">{m.passwordstrength__label()}</Label>
        <Input id="strength-password" type="password" autoComplete="new-password" value={value} onChange={(event) => setValue(event.target.value)} />
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {checks.map((check) => (
          <li key={check.label} className={check.met ? 'text-foreground' : 'text-muted-foreground'}>
            {check.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
