import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/i18n/messages'

export function CreateOrganizationForm() {
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{m.createorganizationform__title()}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="org-name">{m.createorganizationform__name()}</Label>
            <Input id="org-name" name="name" required />
          </div>
          <Button type="submit" className="self-end">{m.createorganizationform__submit()}</Button>
        </form>
      </CardContent>
    </Card>
  )
}
