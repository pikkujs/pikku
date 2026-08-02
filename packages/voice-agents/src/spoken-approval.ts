/**
 * Asking permission out loud.
 *
 * On a screen, a badly worded confirmation is still checkable — the user can
 * see the tool name, the arguments, and the button they are about to press. In
 * a voice conversation the sentence *is* the entire interface, so the sentence
 * they answer has to be the one the function sanctioned, not the model's
 * summary of it. A paraphrase here is not a cosmetic problem: "delete the
 * production database" and "tidy things up" get the same "yeah, go on".
 *
 * So the reason text from `approvalDescription` is never rewritten, never
 * shortened, and never generated from the arguments. It is carried verbatim
 * inside a fixed question, and if a function supplied no description we say so
 * rather than inventing one.
 */

/** A pending approval as it arrives from the agent run. */
export interface PendingApproval {
  toolCallId: string
  toolName: string
  /** The verbatim text from the function's `approvalDescription`. */
  reason?: string
}

export interface SpokenApproval {
  toolCallId: string
  toolName: string
  /** Exactly what to synthesize — nothing else may be spoken in its place. */
  text: string
  /**
   * True when the function supplied no `approvalDescription`, so `text` names
   * the tool instead of describing what it will do. Worth surfacing: it means
   * the user is being asked to consent to something nobody has described, and
   * a stricter caller may prefer to refuse rather than ask.
   */
  undescribed: boolean
}

export interface SpokenApprovalOptions {
  /**
   * Appended after the verbatim reason to turn a statement into a question.
   * Kept separate from the reason precisely so the reason stays untouched.
   */
  question?: string
  /**
   * Used when the function supplied no description. Receives the tool name.
   * The default deliberately admits ignorance rather than guessing.
   */
  undescribed?: (toolName: string) => string
}

const DEFAULT_QUESTION = 'Is that okay?'

const defaultUndescribed = (toolName: string) =>
  `The assistant wants to run ${toolName}, and there is no description of what that does. Should I let it?`

/**
 * The utterance for a single approval. The reason is copied in as-is — only a
 * trailing full stop is added, and only when it would otherwise run into the
 * question.
 */
export const spokenApproval = (
  approval: PendingApproval,
  options: SpokenApprovalOptions = {}
): SpokenApproval => {
  const reason = approval.reason?.trim()

  if (!reason) {
    const undescribed = options.undescribed ?? defaultUndescribed
    return {
      toolCallId: approval.toolCallId,
      toolName: approval.toolName,
      text: undescribed(approval.toolName),
      undescribed: true,
    }
  }

  const question = options.question ?? DEFAULT_QUESTION
  const separator = /[.!?]$/.test(reason) ? ' ' : '. '

  return {
    toolCallId: approval.toolCallId,
    toolName: approval.toolName,
    text: `${reason}${separator}${question}`,
    undescribed: false,
  }
}

/**
 * One utterance per approval, in order.
 *
 * Deliberately not merged into a single sentence: each call gets its own answer,
 * and "add a todo and delete the other one — okay?" cannot be answered with one
 * word without guessing which half the user meant.
 */
export const spokenApprovals = (
  approvals: PendingApproval[],
  options: SpokenApprovalOptions = {}
): SpokenApproval[] =>
  approvals.map((approval) => spokenApproval(approval, options))

export type Consent = 'granted' | 'denied' | 'unclear'

// Longest first: "no problem" has to be recognised as agreement before its
// "no" is read as refusal.
const GRANTS = [
  'no problem',
  'no worries',
  'go ahead',
  'go for it',
  'do it',
  'please do',
  'sounds good',
  'that works',
  'yes please',
  'affirmative',
  'confirm',
  'confirmed',
  'approved',
  'approve',
  'okay',
  'ok',
  'yes',
  'yeah',
  'yep',
  'yup',
  'sure',
  'fine',
]

const DENIALS = [
  'do not',
  'dont',
  'never mind',
  'nevermind',
  'hold on',
  'wait',
  'stop',
  'cancel',
  'forget it',
  'negative',
  'denied',
  'deny',
  'no',
  'nope',
  'nah',
]

const normalise = (transcript: string) =>
  transcript
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const takePhrases = (text: string, phrases: string[]) => {
  let found = false
  let remaining = text
  for (const phrase of phrases) {
    // Matched phrases are removed so a later pass cannot read the same words
    // again — this is what keeps "no problem" from also counting as a refusal.
    const next = remaining.replace(new RegExp(`\\b${phrase}\\b`, 'g'), ' ')
    if (next !== remaining) {
      found = true
      remaining = next
    }
  }
  return { found, remaining }
}

/**
 * What a spoken answer to an approval means.
 *
 * Returns `'unclear'` for anything that is not plainly one or the other,
 * including answers that contain both ("yes — no, wait"). Asking again costs a
 * sentence; guessing costs whatever the tool was about to do, and the caller
 * cannot tell the two apart afterwards. Silence, a cough and a change of
 * subject all land here too, which is correct: none of them are consent.
 */
export const interpretConsent = (transcript: string): Consent => {
  const text = normalise(transcript)
  if (!text) return 'unclear'

  const grants = takePhrases(text, GRANTS)
  const denials = takePhrases(grants.remaining, DENIALS)

  if (grants.found && denials.found) return 'unclear'
  if (denials.found) return 'denied'
  if (grants.found) return 'granted'
  return 'unclear'
}
