import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/i18n/messages'

export function ForgotPassword() {
  return (
    <div className="mx-auto flex min-h-screen max-w-sm items-center px-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle size="lg">{m.forgotpassword__title()}</CardTitle>
          <CardDescription>{m.forgotpassword__description()}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="forgot-email">{m.forgotpassword__email()}</Label>
              <Input id="forgot-email" name="email" type="email" autoComplete="email" required />
            </div>
            <Button type="submit">{m.forgotpassword__submit()}</Button>
            <a href="#" className="text-center text-sm text-muted-foreground hover:text-foreground">{m.forgotpassword__back()}</a>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
