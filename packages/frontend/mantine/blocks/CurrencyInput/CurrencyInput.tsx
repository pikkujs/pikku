import { NativeSelect, TextInput } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'

const data = [
  { value: 'eur', label: asI18n('🇪🇺 EUR') },
  { value: 'usd', label: asI18n('🇺🇸 USD') },
  { value: 'cad', label: asI18n('🇨🇦 CAD') },
  { value: 'gbp', label: asI18n('🇬🇧 GBP') },
  { value: 'aud', label: asI18n('🇦🇺 AUD') },
]

export function CurrencyInput() {
  const select = (
    <NativeSelect
      data={data}
      rightSectionWidth={28}
      styles={{
        input: {
          fontWeight: 500,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          width: 92,
          marginRight: -2,
        },
      }}
      aria-label={m.currencyinput__currency_aria()}
    />
  )

  return (
    <TextInput
      type="number"
      placeholder={asI18n('1000')}
      label={m.currencyinput__label()}
      rightSection={select}
      rightSectionWidth={92}
    />
  )
}
