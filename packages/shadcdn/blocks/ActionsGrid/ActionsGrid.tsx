import { BarChart3, FileText, Settings, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { m } from '@/i18n/messages'

export function ActionsGrid() {
  const actions = [
    { label: m.actionsgrid__a1(), icon: FileText },
    { label: m.actionsgrid__a2(), icon: BarChart3 },
    { label: m.actionsgrid__a3(), icon: Users },
    { label: m.actionsgrid__a4(), icon: Settings },
  ]
  return (
    <div className="grid max-w-md grid-cols-2 gap-3">
      {actions.map(({ label, icon: Icon }) => (
        <Button key={label} variant="outline" size="tile">
          <Icon className="size-6" />
          {label}
        </Button>
      ))}
    </div>
  )
}
