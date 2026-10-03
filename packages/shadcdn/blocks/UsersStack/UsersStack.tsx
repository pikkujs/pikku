import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { m } from '@/i18n/messages'

export function UsersStack() {
  const people = [m.usersstack__i1(), m.usersstack__i2(), m.usersstack__i3()]
  return (
    <div className="flex items-center -space-x-2 rtl:space-x-reverse">
      {people.map((initials) => (
        <Avatar key={initials} border="stack">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      ))}
      <Avatar border="stack">
        <AvatarFallback>{m.usersstack__more()}</AvatarFallback>
      </Avatar>
    </div>
  )
}
