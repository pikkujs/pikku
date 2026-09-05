import { z } from 'zod'

/**
 * A question to put to a person, as a value rather than as a call.
 *
 * The shape is deliberately the one every picker already wants — a short label, the
 * question itself, and zero or more options — because the alternative is a tool call,
 * and a tool call belongs to one harness. A loop that RETURNS a question can be
 * rendered as a picker by a harness that has one, printed as a numbered list by a
 * harness that does not, and read across a process boundary by something that is
 * neither. Nothing here knows which of those is on the other side.
 *
 * `options` is empty for a question nothing can enumerate — "what is this milestone
 * about?" has no candidate answers. It is filled only where the answer comes from a
 * closed vocabulary this package owns, which is the one case a gate can derive the
 * choices honestly rather than inventing plausible-looking ones.
 */
export const KnowledgeQuestionOptionSchema = z.object({
  label: z.string(),
  description: z.string().optional(),
})

export const KnowledgeQuestionSchema = z.object({
  /** A few words naming what is being decided, for a chip or a column heading. */
  header: z.string(),
  /** The question itself, in the language of the app rather than of the notes. */
  question: z.string(),
  /** The answers worth offering, or empty when the answer is free text. */
  options: z.array(KnowledgeQuestionOptionSchema).default([]),
})

export type KnowledgeQuestionOption = z.infer<
  typeof KnowledgeQuestionOptionSchema
>
export type KnowledgeQuestion = z.infer<typeof KnowledgeQuestionSchema>

/** A question whose answer is one of a vocabulary this package closes over. */
export const chooseFrom = (
  header: string,
  question: string,
  options: readonly string[],
  describe: (option: string) => string | undefined = () => undefined
): KnowledgeQuestion => ({
  header,
  question,
  options: options.map((label) => ({ label, description: describe(label) })),
})

/** A question with no candidate answers — the honest shape for free text. */
export const askFreely = (
  header: string,
  question: string
): KnowledgeQuestion => ({ header, question, options: [] })

/**
 * What each milestone status means to somebody who has never read the profile.
 *
 * Written for the person being asked, not for the note: a status is picked by
 * somebody who knows where their app has got to, and `dispatched` is not a word they
 * would otherwise have to learn.
 */
export const STATUS_DESCRIPTIONS: Record<string, string> = {
  designing: 'still choosing how it should look',
  proposed: 'settled, and ready to be built',
  dispatched: 'being built right now',
  built: 'already built',
}

/** What each surface means — where this milestone reaches the person using it. */
export const SURFACE_DESCRIPTIONS: Record<string, string> = {
  app: 'a page somebody opens',
  cli: 'a command somebody runs in a terminal',
  mcp: 'a tool another program calls',
  agent: 'a model that holds your functions and decides when to use them',
  backend: 'no surface of its own — something a later milestone builds on',
}
