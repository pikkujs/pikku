export interface Email {
  id: string
  to: string
  subject: string
  body: string
  sentAt: string
}

export class EmailStore {
  private emails = new Map<string, Email>()

  constructor() {
    const seed: Email[] = [
      {
        id: '1',
        to: 'alice@test.com',
        subject: 'Welcome',
        body: 'Welcome to the team!',
        sentAt: '2026-03-01T10:00:00Z',
      },
      {
        id: '2',
        to: 'bob@test.com',
        subject: 'Meeting',
        body: 'Team sync at 2pm',
        sentAt: '2026-03-01T11:00:00Z',
      },
    ]
    for (const email of seed) {
      this.emails.set(email.id, email)
    }
  }

  list(): Email[] {
    return Array.from(this.emails.values())
  }

  send(to: string, subject: string, body: string): Email {
    const id = String(Date.now())
    const email: Email = {
      id,
      to,
      subject,
      body,
      sentAt: new Date().toISOString(),
    }
    this.emails.set(id, email)
    return email
  }

  reset(): void {
    this.emails.clear()
    const seed: Email[] = [
      {
        id: '1',
        to: 'alice@test.com',
        subject: 'Welcome',
        body: 'Welcome to the team!',
        sentAt: '2026-03-01T10:00:00Z',
      },
      {
        id: '2',
        to: 'bob@test.com',
        subject: 'Meeting',
        body: 'Team sync at 2pm',
        sentAt: '2026-03-01T11:00:00Z',
      },
    ]
    for (const email of seed) {
      this.emails.set(email.id, email)
    }
  }
}
