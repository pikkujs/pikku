//~ name: transactional-email
//~ title: Themed transactional email (template + locale + send call)
//~ when: The app sends an email — welcome, confirmation, digest, notification. Pass the EMAIL as the entity (`--entity order-confirmation`) and it writes the Handlebars template plus the sending function, both already named for it. TWO THINGS ARE STILL YOURS. (1) Add the matching key to `emails/locales/en.json` — camelCase of the template name, with `subject` and `preview` REQUIRED, plus every `{{t.<key>.*}}` the template reads; that file already exists so the scaffold will not touch it. (2) Run pikku-verify afterwards — ANY change under `emails/` has to regenerate the typed template map before the `name:` you pass to `emailService.send` type-checks. Theme every colour with `{{theme.colors.*}}` (never a literal), and add a CTA button ONLY if you already hold a real ABSOLUTE url to point it at — emails cannot use relative links, there is no ambient app URL to hunt for, and a heading + body email is complete without one.
//~ entity: welcomeEmail

// ===== FILE: emails/templates/welcome-email.html =====
//~ include: _welcome-email.partial.html

// ===== FILE: packages/functions/src/functions/send-welcome-email.function.ts =====
import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'

//~ input/output are named module-level consts — never inline at the input:/output:
//~ site (PKU489). `emailService` is always wired; there is nothing to register.
export const SendWelcomeEmailInput = z.object({
  email: z.string().email(),
  firstName: z.string(),
})
export const SendWelcomeEmailOutput = z.object({ ok: z.boolean() })

export const sendWelcomeEmail = pikkuSessionlessFunc({
  expose: true,
  description: 'Send the welcome-email email.',
  input: SendWelcomeEmailInput,
  output: SendWelcomeEmailOutput,
  func: async ({ emailService }, input) => {
    await emailService.send({
      to: input.email,
      //~ `name` is typed against emails/templates/ — a red squiggle here means
      //~ pikku-verify has not regenerated the template map yet.
      template: {
        name: 'welcome-email',
        data: { firstName: input.firstName },
      },
    })
    return { ok: true }
  },
})

//~ Many recipients? Promise.all the sends inside ONE function body — see
//~ {name: workflow} for the digest fan-out pattern.
