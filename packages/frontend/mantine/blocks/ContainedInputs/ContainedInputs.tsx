import { Select, TextInput } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import classes from './ContainedInput.module.css'

export function ContainedInputs() {
  return (
    <>
      <TextInput
        label={m.containedinputs__shipping_label()}
        placeholder={asI18n('15329 Huston 21st')}
        classNames={classes}
      />

      <Select
        mt="md"
        comboboxProps={{ withinPortal: true }}
        data={['React', 'Angular', 'Svelte', 'Vue'].map((f) => asI18n(f))}
        placeholder={m.containedinputs__framework_placeholder()}
        label={m.containedinputs__framework_label()}
        classNames={classes}
      />
    </>
  )
}
