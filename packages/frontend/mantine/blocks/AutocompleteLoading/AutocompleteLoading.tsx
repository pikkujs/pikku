import { useRef, useState } from 'react'
import { Autocomplete, Loader } from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'

export function AutocompleteLoading() {
  const timeoutRef = useRef<number>(-1)
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<string[]>([])

  const handleChange = (val: string) => {
    window.clearTimeout(timeoutRef.current)
    setValue(val)
    setData([])

    if (val.trim().length === 0 || val.includes('@')) {
      setLoading(false)
    } else {
      setLoading(true)
      timeoutRef.current = window.setTimeout(() => {
        setLoading(false)
        setData(['gmail.com', 'outlook.com', 'yahoo.com'].map((provider) => `${val}@${provider}`))
      }, 1000)
    }
  }

  return (
    <Autocomplete
      value={value}
      data={data.map((d) => asI18n(d))}
      onChange={handleChange}
      rightSection={loading ? <Loader size={16} /> : null}
      label={m.autocompleteloading__label()}
      placeholder={m.autocompleteloading__placeholder()}
    />
  )
}
