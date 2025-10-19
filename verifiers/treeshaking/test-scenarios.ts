export interface TestScenario {
  name: string
  filter: string
  expectedServices: string[]
  description: string
}

export const scenarios: TestScenario[] = [
  // Baseline
  {
    name: 'Baseline (no filters)',
    filter: '',
    expectedServices: [
      'analytics',
      'email',
      'logger',
      'payment',
      'sms',
      'storage',
    ],
    description: 'All services should be included when no filters are applied',
  },

  // Single tag filters
  {
    name: 'Tag: notifications',
    filter: '--tags=notifications',
    expectedServices: ['email', 'logger', 'sms'],
    description:
      'Email, sms, logger (middleware), and session services should be included',
  },
  {
    name: 'Tag: email',
    filter: '--tags=email',
    expectedServices: ['email', 'logger'],
    description:
      'Email (function + permissions), logger (middleware), and session services',
  },
  {
    name: 'Tag: sms',
    filter: '--tags=sms',
    expectedServices: ['email', 'logger', 'sms'],
    description:
      'SMS (function), logger (middleware), and session services (email, logger)',
  },
  {
    name: 'Tag: payments',
    filter: '--tags=payments',
    expectedServices: ['analytics', 'email', 'logger', 'payment', 'storage'],
    description:
      'Payment route uses payment + analytics (function + middleware) + logger + storage (middleware) + session services',
  },
  {
    name: 'Tag: storage',
    filter: '--tags=storage',
    expectedServices: ['email', 'logger', 'storage'],
    description: 'Storage (function) and session services (email, logger)',
  },

  // Multiple tag filters (OR logic)
  {
    name: 'Tags: notifications,payments',
    filter: '--tags=notifications,payments',
    expectedServices: [
      'analytics',
      'email',
      'logger',
      'payment',
      'sms',
      'storage',
    ],
    description: 'All notification routes + payment route + session services',
  },
  {
    name: 'Tags: email,sms',
    filter: '--tags=email,sms',
    expectedServices: ['email', 'logger', 'sms'],
    description: 'Both email and SMS routes + session services',
  },
  {
    name: 'Tags: notifications,storage',
    filter: '--tags=notifications,storage',
    expectedServices: ['email', 'logger', 'sms', 'storage'],
    description: 'All notification + storage routes + session services',
  },

  // Type filters
  {
    name: 'Type: http',
    filter: '--types=http',
    expectedServices: [
      'analytics',
      'email',
      'logger',
      'payment',
      'sms',
      'storage',
    ],
    description:
      'All services should be included (all wirings are HTTP) + session services',
  },

  // HTTP method filters
  {
    name: 'HTTP Method: POST',
    filter: '--httpMethods=POST',
    expectedServices: [
      'analytics',
      'email',
      'logger',
      'payment',
      'sms',
      'storage',
    ],
    description:
      'All services should be included (all routes are POST) + session services',
  },
  {
    name: 'HTTP Method: GET',
    filter: '--httpMethods=GET',
    expectedServices: ['email', 'logger'],
    description: 'No GET routes exist, only session services',
  },

  // HTTP route filters
  {
    name: 'HTTP Route: /api/notifications/*',
    filter: '--httpRoutes=/api/notifications/*',
    expectedServices: ['email', 'logger', 'sms'],
    description: 'Only notification routes + session services',
  },
  {
    name: 'HTTP Route: /api/payments/*',
    filter: '--httpRoutes=/api/payments/*',
    expectedServices: ['analytics', 'email', 'logger', 'payment', 'storage'],
    description: 'Only payment routes + session services',
  },
  {
    name: 'HTTP Route: /api/storage/*',
    filter: '--httpRoutes=/api/storage/*',
    expectedServices: ['email', 'logger', 'storage'],
    description: 'Only storage routes + session services',
  },

  // Directory filters
  {
    name: 'Directory: src/functions',
    filter: '--directories=src/functions',
    expectedServices: [
      'analytics',
      'email',
      'logger',
      'payment',
      'sms',
      'storage',
    ],
    description:
      'All services should be included (all wirings are in src/functions) + session services',
  },
  {
    name: 'Directory: src/nonexistent',
    filter: '--directories=src/nonexistent',
    expectedServices: ['email', 'logger'],
    description: 'No wirings in nonexistent directory, only session services',
  },

  // Combination filters
  {
    name: 'Combo: notifications + POST',
    filter: '--tags=notifications --httpMethods=POST',
    expectedServices: ['email', 'logger', 'sms'],
    description: 'Notification routes that are POST + session services',
  },
  {
    name: 'Combo: payments + http',
    filter: '--tags=payments --types=http',
    expectedServices: ['analytics', 'email', 'logger', 'payment', 'storage'],
    description: 'Payment HTTP routes + session services',
  },

  // Wildcard name filters
  {
    name: 'Name: send*',
    filter: '--names=send*',
    expectedServices: ['email', 'logger', 'sms'],
    description:
      'Routes using sendEmail and sendSMS functions + middleware + session services',
  },
  {
    name: 'Name: process*',
    filter: '--names=process*',
    expectedServices: ['analytics', 'email', 'logger', 'payment', 'storage'],
    description:
      'Routes using processPayment function + middleware + session services',
  },
  {
    name: 'Name: *Payment',
    filter: '--names=*Payment',
    expectedServices: ['analytics', 'email', 'logger', 'payment', 'storage'],
    description:
      'Routes using functions ending with "Payment" + middleware + session services',
  },
  {
    name: 'Name: saveData',
    filter: '--names=saveData',
    expectedServices: ['email', 'logger', 'storage'],
    description: 'Routes using saveData function + session services',
  },
]
