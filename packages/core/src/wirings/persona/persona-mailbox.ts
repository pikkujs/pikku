/** One email a persona received. */
export interface ReceivedEmail {
  to: string
  from: string
  subject: string
  receivedAt: Date
  /**
   * Links found in the body, already extracted.
   *
   * Extracted rather than handed over as text on purpose — see
   * {@link PersonaMailbox}. A magic link is the only part of most emails a
   * virtual user needs, and it is checkable in a way prose is not.
   */
  links: string[]
  /**
   * Numeric codes found in the body: OTPs, verification codes.
   *
   * Separate from `links` because plenty of flows never send a URL at all, and
   * a run that can only follow links cannot complete them.
   */
  codes: string[]
  /**
   * The raw body, if the implementation kept it.
   *
   * Deliberately optional and deliberately awkward to reach. Nothing in the
   * engine puts this in a model's context: an email body is attacker-controlled
   * text arriving through the front door, and a virtual user holds a real
   * session.
   */
  body?: string
}

/**
 * Where a persona reads its mail.
 *
 * Capturing inbound mail is platform-specific — on Cloudflare an Email Worker
 * on the test domain, elsewhere whatever the stage can receive with — so pikku
 * declares the interface and ships no default.
 *
 * Implementations **must** apply {@link MailboxAllowlist} before returning
 * anything. That is the primary defence against prompt injection: a virtual
 * user's address is real and deliverable, so anyone who learns it can send it
 * instructions, and the run holds a live session against a real stage.
 */
export interface PersonaMailbox {
  /**
   * Wait for a matching email, or reject on timeout.
   *
   * The flows this exists for — sign-up, magic link, invite, reset — all block
   * on one arriving, so waiting is the primary operation and polling is the
   * fallback rather than the other way round.
   */
  waitFor(
    address: string,
    opts?: {
      subject?: RegExp
      from?: string
      since?: Date
      timeoutMs?: number
    }
  ): Promise<ReceivedEmail>

  /** Everything currently held for an address. */
  list(address: string): Promise<ReceivedEmail[]>

  /**
   * Empties an address.
   *
   * Called between runs. Without it a run reads the previous run's magic link,
   * succeeds, and reports a passing sign-up flow that never ran.
   */
  clear(address: string): Promise<void>
}

/** Who a mailbox will accept mail from. */
export interface MailboxAllowlist {
  /**
   * Sender addresses or domains the stage itself sends as, e.g.
   * `['noreply@example.com', 'example.com']`.
   */
  senders: readonly string[]
  /**
   * Origins a link may point at, e.g. `['https://staging.example.com']`.
   *
   * A link that survives sender checking can still point anywhere; following
   * one off-origin is how a session leaves the stage it was scoped to.
   */
  linkOrigins?: readonly string[]
}

const senderMatches = (from: string, entry: string): boolean => {
  const sender = from.trim().toLowerCase()
  const allowed = entry.trim().toLowerCase()
  if (allowed.includes('@')) {
    return sender === allowed
  }
  // A bare domain matches the domain part only — never a substring, or
  // 'example.com' would admit 'example.com.attacker.net'.
  const at = sender.lastIndexOf('@')
  return at !== -1 && sender.slice(at + 1) === allowed
}

/** Whether an email may be shown to a run at all. */
export const isAllowedSender = (
  from: string,
  allowlist: MailboxAllowlist
): boolean => allowlist.senders.some((entry) => senderMatches(from, entry))

/**
 * Drops links pointing outside the permitted origins.
 *
 * Returns the surviving links rather than rejecting the whole email: a
 * legitimate email from the stage may well carry an unsubscribe link to
 * somewhere else, and refusing the email over it would break the flow this
 * exists to test.
 */
export const allowedLinks = (
  links: readonly string[],
  allowlist: MailboxAllowlist
): string[] => {
  const origins = allowlist.linkOrigins
  if (!origins?.length) {
    return [...links]
  }
  const permitted = new Set(
    origins.map((origin) => {
      try {
        return new URL(origin).origin
      } catch {
        return origin
      }
    })
  )
  return links.filter((link) => {
    try {
      return permitted.has(new URL(link).origin)
    } catch {
      return false
    }
  })
}

/**
 * Applies the allowlist to a batch of received mail.
 *
 * Implementations call this rather than filtering themselves — a mailbox that
 * forgets is not obviously broken, it just quietly becomes an injection
 * channel, and nothing in a passing run would say so.
 */
export const applyMailboxAllowlist = (
  emails: readonly ReceivedEmail[],
  allowlist: MailboxAllowlist
): ReceivedEmail[] =>
  emails
    .filter((email) => isAllowedSender(email.from, allowlist))
    .map((email) => ({ ...email, links: allowedLinks(email.links, allowlist) }))
