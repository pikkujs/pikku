import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { m } from '@/i18n/messages'

export function ButtonCopy() {
  const [done, setDone] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(m.buttoncopy__value())
    setDone(true)
    setTimeout(() => setDone(false), 1500)
  }
  return (
    <Button variant="outline" onClick={copy}>
      {done ? <Check className="size-4" /> : <Copy className="size-4" />}
      {done ? m.buttoncopy__copied() : m.buttoncopy__copy()}
    </Button>
  )
}
