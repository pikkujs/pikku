import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { m } from '@/i18n/messages'

export function LanguagePicker() {
  return (
    <Select defaultValue="en">
      <SelectTrigger aria-label={m.languagepicker__label()}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">{m.languagepicker__en()}</SelectItem>
        <SelectItem value="de">{m.languagepicker__de()}</SelectItem>
        <SelectItem value="ar">{m.languagepicker__ar()}</SelectItem>
      </SelectContent>
    </Select>
  )
}
