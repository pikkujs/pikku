import { TriangleAlert } from 'lucide-react'
import { TextInput } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import classes from './InputValidation.module.css'

export function InputValidation() {
  return (
    <TextInput
      label={m.inputvalidation__label()}
      error={m.inputvalidation__error()}
      defaultValue={asI18n('hello!gmail.com')}
      classNames={{ input: classes.invalid }}
      rightSection={<TriangleAlert strokeWidth={1.5} size={18} className={classes.icon} />}
    />
  )
}
