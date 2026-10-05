import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { m } from '@/i18n/messages'

export function OrganizationSwitcher() {
  return (
    <Select defaultValue="acme">
      <SelectTrigger aria-label={m.organizationswitcher__label()} className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="acme">{m.organizationswitcher__o1()}</SelectItem>
        <SelectItem value="globex">{m.organizationswitcher__o2()}</SelectItem>
      </SelectContent>
    </Select>
  )
}
