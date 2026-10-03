import type { FC, FormEvent, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { m } from '@/i18n/messages'

export type AuthFormValues = { email: string; password: string }

export type AuthCardProps = {
  title: string
  description: string
  cta: string
  passwordAutoComplete: 'current-password' | 'new-password'
  busy: boolean
  error: string | null
  onAuthSubmit: (values: AuthFormValues) => void
  secondaryAction?: ReactNode
  footer?: ReactNode
}

export const AuthCard: FC<AuthCardProps> = ({
  title,
  description,
  cta,
  passwordAutoComplete,
  busy,
  error,
  onAuthSubmit,
  secondaryAction,
  footer,
}) => {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    onAuthSubmit({ email: String(form.get('email') ?? ''), password: String(form.get('password') ?? '') })
  }
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <form onSubmit={submit}>
          <CardContent>
            <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{m.common__email()}</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required placeholder={m.common__email_placeholder()} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{m.common__password()}</Label>
              <Input id="password" name="password" type="password" autoComplete={passwordAutoComplete} required />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {secondaryAction}
            <Button type="submit" disabled={busy}>
              {cta}
            </Button>
            </div>
          </CardContent>
        </form>
        {footer ? <CardFooter>
            <p className="w-full text-center text-sm text-muted-foreground">{footer}</p>
          </CardFooter> : null}
      </Card>
    </main>
  )
}
