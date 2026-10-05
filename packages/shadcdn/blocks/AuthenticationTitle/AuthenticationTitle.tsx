import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/i18n/messages'

export function AuthenticationTitle() {
  return (
    <div className="mx-auto flex min-h-screen max-w-sm items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle size="lg">{m.authenticationtitle__title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="signin-email">{m.authenticationtitle__email()}</Label>
              <Input id="signin-email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="signin-password">{m.authenticationtitle__password()}</Label>
                <a href="#" className="text-sm text-muted-foreground hover:text-foreground">{m.authenticationtitle__forgot()}</a>
              </div>
              <Input id="signin-password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <Button type="submit">{m.authenticationtitle__submit()}</Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {m.authenticationtitle__no_account()} <a href="#" className="font-medium text-foreground underline-offset-4 hover:underline">{m.authenticationtitle__create()}</a>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
