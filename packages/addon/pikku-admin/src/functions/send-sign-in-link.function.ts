import { pikkuFunc } from '#pikku/addon/function'
import { sendAuthUserSignInLink } from '@pikku/better-auth'
import { SendSignInLinkInput, Success } from '../lib/user.schemas.js'

export const sendSignInLink = pikkuFunc({
  title: 'Send Sign-In Link',
  description:
    'Mails a user a magic link they can sign in with. With magicLink({ disableSignUp: true }) a link only admits an email that already has a user row, which makes this the invitation for an account created without a password. Requires the magicLink plugin.',
  expose: true,
  // `admin:users:create` rather than a scope of its own: the link is the second
  // half of provisioning an account out of band, and it is strictly weaker than
  // `admin:users:password` — it goes to the user's own inbox, so it hands the
  // caller nothing. A separate leaf would also have to be mirrored byte-for-byte
  // in `@pikku/better-auth`'s tree, making an addon bump un-upgradable on its own.
  scopes: ['admin:users:create'],
  input: SendSignInLinkInput,
  output: Success,
  func: async ({ auth }, { email, callbackURL }) => {
    await sendAuthUserSignInLink(auth, { email, callbackURL })
    return { success: true }
  },
})
