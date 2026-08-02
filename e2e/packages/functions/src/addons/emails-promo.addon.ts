import { wireAddon } from '#pikku/pikku-types.gen.js'

// A SECOND instance of @pikku/addon-emails (wirings/emails.wirings.ts is the
// first). Two instances of one package must not share a secret, so this
// instance remaps the addon's EMAILS_CREDENTIALS to its own project secret.
// The console's instance selector is what resolves the logical name against
// whichever instance is selected.
wireAddon({
  name: 'emails-promo',
  package: '@pikku/addon-emails',
  secretOverrides: { EMAILS_CREDENTIALS: 'EMAILS_PROMO_CREDENTIALS' },
})
