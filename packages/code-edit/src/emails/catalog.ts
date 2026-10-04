export interface EmailCatalogEntry {
  name: string
  templateKey: string
  title: string
  description: string
  data: string[]
  locale: Record<string, Record<string, string>>
  usage: string | null
  source: Record<string, string>
}

export const EMAIL_CATALOG: EmailCatalogEntry[] = [
  {
    name: 'invitation',
    templateKey: 'invitation',
    title: 'Organization invitation',
    description:
      "Invite someone to join an organization/team. Pairs with the organization() Better Auth plugin's sendInvitationEmail handler.",
    data: ['inviteUrl', 'organizationName', 'inviterName'],
    locale: {
      invitation: {
        subject: '{{inviterName}} invited you to join {{organizationName}}',
        preview:
          "You've been invited to join {{organizationName}} on {{appName}}.",
        heading: "You're invited",
        intro:
          '{{inviterName}} has invited you to join {{organizationName}} on {{appName}}. Accept the invitation to get started.',
        cta: 'Accept invitation',
        fallback:
          'If the button does not work, copy and paste this URL into your browser:',
        expiry: 'This invitation expires in 48 hours.',
      },
    },
    usage:
      "Wire it into Better Auth's organization() plugin so an invite actually sends:\n\n```ts\n// packages/functions/src/auth.ts\nimport { organization } from 'better-auth/plugins'\n\norganization({\n  async sendInvitationEmail({ email, invitation, organization, inviter }) {\n    await email.send({\n      to: email,\n      template: {\n        name: 'invitation',\n        data: {\n          inviteUrl: `${appUrl}/accept-invite?invitationId=${invitation.id}`,\n          organizationName: organization.name,\n          inviterName: inviter.user.name,\n        },\n      },\n    })\n  },\n})\n```\n\nThe `/accept-invite` route accepts it with `authClient.organization.acceptInvitation({ invitationId })`.",
    source: {
      'invitation.html':
        '<p\n  style="margin:0 0 12px;color:{{theme.colors.accent}};font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;"\n>\n  {{appName}}\n</p>\n<h1 style="margin:0 0 16px;color:{{theme.colors.text}};font-size:28px;line-height:1.1;">\n  {{t.invitation.heading}}\n</h1>\n<p style="margin:0 0 24px;color:{{theme.colors.muted}};font-size:16px;line-height:1.6;">\n  {{t.invitation.intro}}\n</p>\n<p style="margin: 0 0 24px">\n  <a\n    href="{{inviteUrl}}"\n    style="display:inline-block;background:{{theme.colors.button}};color:{{theme.colors.buttonText}};text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:700;"\n  >\n    {{t.invitation.cta}}\n  </a>\n</p>\n<p style="margin:0 0 8px;color:{{theme.colors.text}};font-size:14px;line-height:1.6;">\n  {{t.invitation.fallback}}\n</p>\n<p\n  style="margin:0;color:{{theme.colors.muted}};font-size:14px;line-height:1.6;word-break:break-all;"\n>\n  {{inviteUrl}}\n</p>\n<p style="margin:24px 0 0;color:{{theme.colors.muted}};font-size:13px;line-height:1.6;">\n  {{t.invitation.expiry}}\n</p>\n{{> footer}}\n',
      'invitation.subject.txt': '{{t.invitation.subject}}\n',
      'invitation.text.txt':
        '{{t.invitation.heading}}\n\n{{t.invitation.intro}}\n\n{{inviteUrl}}\n\n{{t.invitation.expiry}}\n',
    },
  },
  {
    name: 'magic-link',
    templateKey: 'magicLink',
    title: 'Magic-link sign-in',
    description:
      "Passwordless sign-in link. Pairs with the magicLink() Better Auth plugin's sendMagicLink handler.",
    data: ['magicUrl'],
    locale: {
      magicLink: {
        subject: 'Your {{appName}} sign-in link',
        preview: 'Sign in to {{appName}} with the link inside.',
        heading: 'Sign in to {{appName}}',
        intro:
          "Click the button below to sign in. No password needed. If you didn't request this, you can ignore this email.",
        cta: 'Sign in',
        fallback:
          'If the button does not work, copy and paste this URL into your browser:',
        expiry: 'This link expires in 5 minutes and can only be used once.',
      },
    },
    usage:
      "Wire it into the magicLink() plugin:\n\n```ts\nimport { magicLink } from 'better-auth/plugins'\n\nmagicLink({\n  async sendMagicLink({ email: to, url }) {\n    await email.send({ to, template: { name: 'magic-link', data: { magicUrl: url } } })\n  },\n})\n```",
    source: {
      'magic-link.html':
        '<p\n  style="margin:0 0 12px;color:{{theme.colors.accent}};font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;"\n>\n  {{appName}}\n</p>\n<h1 style="margin:0 0 16px;color:{{theme.colors.text}};font-size:28px;line-height:1.1;">\n  {{t.magicLink.heading}}\n</h1>\n<p style="margin:0 0 24px;color:{{theme.colors.muted}};font-size:16px;line-height:1.6;">\n  {{t.magicLink.intro}}\n</p>\n<p style="margin: 0 0 24px">\n  <a\n    href="{{magicUrl}}"\n    style="display:inline-block;background:{{theme.colors.button}};color:{{theme.colors.buttonText}};text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:700;"\n  >\n    {{t.magicLink.cta}}\n  </a>\n</p>\n<p style="margin:0 0 8px;color:{{theme.colors.text}};font-size:14px;line-height:1.6;">\n  {{t.magicLink.fallback}}\n</p>\n<p\n  style="margin:0;color:{{theme.colors.muted}};font-size:14px;line-height:1.6;word-break:break-all;"\n>\n  {{magicUrl}}\n</p>\n<p style="margin:24px 0 0;color:{{theme.colors.muted}};font-size:13px;line-height:1.6;">\n  {{t.magicLink.expiry}}\n</p>\n{{> footer}}\n',
      'magic-link.subject.txt': '{{t.magicLink.subject}}\n',
      'magic-link.text.txt':
        '{{t.magicLink.heading}}\n\n{{t.magicLink.intro}}\n\n{{magicUrl}}\n\n{{t.magicLink.expiry}}\n',
    },
  },
  {
    name: 'password-reset',
    templateKey: 'passwordReset',
    title: 'Password reset',
    description:
      "Sent when a user requests a password reset. Wire it into Better Auth's emailAndPassword.sendResetPassword.",
    data: ['resetUrl'],
    locale: {
      passwordReset: {
        subject: 'Reset your {{appName}} password',
        preview: 'Reset your password with the link inside.',
        heading: 'Reset your password',
        intro:
          "We received a request to reset your {{appName}} password. Click below to choose a new one. If you didn't ask for this, you can ignore this email.",
        cta: 'Reset password',
        fallback:
          'If the button does not work, copy and paste this URL into your browser:',
        expiry: 'This link expires in 1 hour.',
      },
    },
    usage:
      "Wire it into betterAuth({ emailAndPassword: { sendResetPassword } }):\n\n```ts\nemailAndPassword: {\n  enabled: true,\n  async sendResetPassword({ user, url }) {\n    await email.send({ to: user.email, template: { name: 'password-reset', data: { resetUrl: url } } })\n  },\n}\n```",
    source: {
      'password-reset.html':
        '<p\n  style="margin:0 0 12px;color:{{theme.colors.accent}};font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;"\n>\n  {{appName}}\n</p>\n<h1 style="margin:0 0 16px;color:{{theme.colors.text}};font-size:28px;line-height:1.1;">\n  {{t.passwordReset.heading}}\n</h1>\n<p style="margin:0 0 24px;color:{{theme.colors.muted}};font-size:16px;line-height:1.6;">\n  {{t.passwordReset.intro}}\n</p>\n<p style="margin: 0 0 24px">\n  <a\n    href="{{resetUrl}}"\n    style="display:inline-block;background:{{theme.colors.button}};color:{{theme.colors.buttonText}};text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:700;"\n  >\n    {{t.passwordReset.cta}}\n  </a>\n</p>\n<p style="margin:0 0 8px;color:{{theme.colors.text}};font-size:14px;line-height:1.6;">\n  {{t.passwordReset.fallback}}\n</p>\n<p\n  style="margin:0;color:{{theme.colors.muted}};font-size:14px;line-height:1.6;word-break:break-all;"\n>\n  {{resetUrl}}\n</p>\n<p style="margin:24px 0 0;color:{{theme.colors.muted}};font-size:13px;line-height:1.6;">\n  {{t.passwordReset.expiry}}\n</p>\n{{> footer}}\n',
      'password-reset.subject.txt': '{{t.passwordReset.subject}}\n',
      'password-reset.text.txt':
        '{{t.passwordReset.heading}}\n\n{{t.passwordReset.intro}}\n\n{{resetUrl}}\n\n{{t.passwordReset.expiry}}\n',
    },
  },
  {
    name: 'receipt',
    templateKey: 'receipt',
    title: 'Payment receipt',
    description:
      'Confirms a payment/purchase with a line item, amount and date. Send after a successful charge (e.g. from a Stripe webhook).',
    data: ['itemName', 'amount', 'date', 'receiptUrl'],
    locale: {
      receipt: {
        subject: 'Your {{appName}} receipt',
        preview: 'Thanks for your payment — your receipt is inside.',
        heading: 'Payment received',
        intro: "Thanks for your payment. Here's a summary for your records.",
        date_label: 'Date',
        cta: 'View receipt',
      },
    },
    usage:
      "Send after a successful charge (amount is a preformatted string like \"$29.00\"):\n\n```ts\nawait email.send({ to: customer.email, template: { name: 'receipt', data: { itemName: 'Pro plan', amount: '$29.00', date: new Date().toLocaleDateString(), receiptUrl } } })\n```",
    source: {
      'receipt.html':
        '<p\n  style="margin:0 0 12px;color:{{theme.colors.accent}};font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;"\n>\n  {{appName}}\n</p>\n<h1 style="margin:0 0 16px;color:{{theme.colors.text}};font-size:28px;line-height:1.1;">\n  {{t.receipt.heading}}\n</h1>\n<p style="margin:0 0 24px;color:{{theme.colors.muted}};font-size:16px;line-height:1.6;">\n  {{t.receipt.intro}}\n</p>\n<table role="presentation" width="100%" style="margin: 0 0 24px; border-collapse: collapse">\n  <tr>\n    <td\n      style="padding:12px 0;border-top:1px solid {{theme.colors.border}};color:{{theme.colors.text}};font-size:15px;"\n    >\n      {{itemName}}\n    </td>\n    <td\n      style="padding:12px 0;border-top:1px solid {{theme.colors.border}};color:{{theme.colors.text}};font-size:15px;text-align:right;font-weight:700;"\n    >\n      {{amount}}\n    </td>\n  </tr>\n  <tr>\n    <td\n      style="padding:12px 0;border-top:1px solid {{theme.colors.border}};color:{{theme.colors.muted}};font-size:13px;"\n    >\n      {{t.receipt.date_label}}\n    </td>\n    <td\n      style="padding:12px 0;border-top:1px solid {{theme.colors.border}};color:{{theme.colors.muted}};font-size:13px;text-align:right;"\n    >\n      {{date}}\n    </td>\n  </tr>\n</table>\n<p style="margin: 0 0 24px">\n  <a\n    href="{{receiptUrl}}"\n    style="display:inline-block;background:{{theme.colors.button}};color:{{theme.colors.buttonText}};text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:700;"\n  >\n    {{t.receipt.cta}}\n  </a>\n</p>\n{{> footer}}\n',
      'receipt.subject.txt': '{{t.receipt.subject}}\n',
      'receipt.text.txt':
        '{{t.receipt.heading}}\n\n{{t.receipt.intro}}\n\n{{itemName}}: {{amount}}\n{{t.receipt.date_label}}: {{date}}\n\n{{receiptUrl}}\n',
    },
  },
  {
    name: 'welcome',
    templateKey: 'welcome',
    title: 'Welcome email',
    description:
      'Sent right after sign-up. Greets the new user by name and points them at the app. Send it from databaseHooks.user.create.after.',
    data: ['name', 'dashboardUrl'],
    locale: {
      welcome: {
        subject: 'Welcome to {{appName}}',
        preview: "Welcome aboard — here's how to get started.",
        heading: 'Welcome, {{name}}',
        intro:
          "Thanks for joining {{appName}}. Everything's set up and ready — jump in whenever you're ready.",
        cta: 'Open {{appName}}',
        outro: 'Glad to have you on board.',
      },
    },
    usage:
      "Send from the post-signup hook in packages/functions/src/auth.ts:\n\n```ts\ndatabaseHooks: {\n  user: { create: { after: async (user) => {\n    await email.send({ to: user.email, template: { name: 'welcome', data: { name: user.name, dashboardUrl: `${appUrl}/app` } } })\n  } } },\n}\n```",
    source: {
      'welcome.html':
        '<p\n  style="margin:0 0 12px;color:{{theme.colors.accent}};font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;"\n>\n  {{appName}}\n</p>\n<h1 style="margin:0 0 16px;color:{{theme.colors.text}};font-size:28px;line-height:1.1;">\n  {{t.welcome.heading}}\n</h1>\n<p style="margin:0 0 24px;color:{{theme.colors.muted}};font-size:16px;line-height:1.6;">\n  {{t.welcome.intro}}\n</p>\n<p style="margin: 0 0 24px">\n  <a\n    href="{{dashboardUrl}}"\n    style="display:inline-block;background:{{theme.colors.button}};color:{{theme.colors.buttonText}};text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:700;"\n  >\n    {{t.welcome.cta}}\n  </a>\n</p>\n<p style="margin:0;color:{{theme.colors.muted}};font-size:14px;line-height:1.6;">\n  {{t.welcome.outro}}\n</p>\n{{> footer}}\n',
      'welcome.subject.txt': '{{t.welcome.subject}}\n',
      'welcome.text.txt':
        '{{t.welcome.heading}}\n\n{{t.welcome.intro}}\n\n{{dashboardUrl}}\n\n{{t.welcome.outro}}\n',
    },
  },
]
