import { Button } from '@/ui/button'

export const ErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive p-6">
    <b>That did not work.</b>
    <p className="text-muted-foreground">{message}</p>
    <Button variant="outline" onClick={onRetry}>
      Try again
    </Button>
  </div>
)
