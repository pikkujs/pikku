export interface TestScenario {
  name: string
  filter: string
  expectedSingletonServices: string[]
  expectedSessionServices: string[]
  description: string
}

export const scenarios: TestScenario[] = [
  // Baseline
  {
    name: 'Baseline (no filters)',
    filter: '',
    expectedSingletonServices: [
      'analytics',
      'email',
      'logger',
      'payment',
      'sms',
    ],
    expectedSessionServices: ['storage'],
    description: 'All services should be included when no filters are applied',
  },

  // Single tag filters
  {
    name: 'Tag: notifications',
    filter: '--tags=notifications',
    expectedSingletonServices: ['email', 'logger', 'sms'],
    expectedSessionServices: [],
    description: 'Email, sms, logger (middleware) from notification routes',
  },
  {
    name: 'Tag: email',
    filter: '--tags=email',
    expectedSingletonServices: ['email', 'logger'],
    expectedSessionServices: [],
    description: 'Email (function + permissions), logger (middleware)',
  },
  {
    name: 'Tag: sms',
    filter: '--tags=sms',
    expectedSingletonServices: ['email', 'logger', 'sms'],
    expectedSessionServices: [],
    description:
      'SMS (function), logger (middleware), email/logger from session creation',
  },
  {
    name: 'Tag: payments',
    filter: '--tags=payments',
    expectedSingletonServices: ['analytics', 'email', 'logger', 'payment'],
    expectedSessionServices: ['storage'],
    description:
      'Payment route uses payment + analytics (function + middleware) + logger + storage (rateLimiter middleware)',
  },
  {
    name: 'Tag: storage',
    filter: '--tags=storage',
    expectedSingletonServices: ['email', 'logger'],
    expectedSessionServices: ['storage'],
    description:
      'Storage (session service) with email/logger from session creation',
  },

  // Multiple tag filters (OR logic)
  {
    name: 'Tags: notifications,payments',
    filter: '--tags=notifications,payments',
    expectedSingletonServices: [
      'analytics',
      'email',
      'logger',
      'payment',
      'sms',
    ],
    expectedSessionServices: ['storage'],
    description: 'All notification routes + payment route',
  },
  {
    name: 'Tags: email,sms',
    filter: '--tags=email,sms',
    expectedSingletonServices: ['email', 'logger', 'sms'],
    expectedSessionServices: [],
    description: 'Both email and SMS routes',
  },
  {
    name: 'Tags: notifications,storage',
    filter: '--tags=notifications,storage',
    expectedSingletonServices: ['email', 'logger', 'sms'],
    expectedSessionServices: ['storage'],
    description: 'All notification + storage routes',
  },

  // Type filters
  {
    name: 'Type: http',
    filter: '--types=http',
    expectedSingletonServices: [
      'analytics',
      'email',
      'logger',
      'payment',
      'sms',
    ],
    expectedSessionServices: ['storage'],
    description: 'All services should be included (all wirings are HTTP)',
  },

  // HTTP method filters
  {
    name: 'HTTP Method: POST',
    filter: '--httpMethods=POST',
    expectedSingletonServices: [
      'analytics',
      'email',
      'logger',
      'payment',
      'sms',
    ],
    expectedSessionServices: ['storage'],
    description: 'All services should be included (all routes are POST)',
  },
  {
    name: 'HTTP Method: GET',
    filter: '--httpMethods=GET',
    expectedSingletonServices: ['email', 'logger'],
    expectedSessionServices: [],
    description: 'No GET routes exist, only email/logger from session creation',
  },

  // HTTP route filters
  {
    name: 'HTTP Route: /api/notifications/*',
    filter: '--httpRoutes=/api/notifications/*',
    expectedSingletonServices: ['email', 'logger', 'sms'],
    expectedSessionServices: [],
    description: 'Only notification routes',
  },
  {
    name: 'HTTP Route: /api/payments/*',
    filter: '--httpRoutes=/api/payments/*',
    expectedSingletonServices: ['analytics', 'email', 'logger', 'payment'],
    expectedSessionServices: ['storage'],
    description: 'Only payment routes',
  },
  {
    name: 'HTTP Route: /api/storage/*',
    filter: '--httpRoutes=/api/storage/*',
    expectedSingletonServices: ['email', 'logger'],
    expectedSessionServices: ['storage'],
    description: 'Only storage routes',
  },

  // Directory filters
  {
    name: 'Directory: src/functions',
    filter: '--directories=src/functions',
    expectedSingletonServices: [
      'analytics',
      'email',
      'logger',
      'payment',
      'sms',
    ],
    expectedSessionServices: ['storage'],
    description:
      'All services should be included (all wirings are in src/functions)',
  },
  {
    name: 'Directory: src/nonexistent',
    filter: '--directories=src/nonexistent',
    expectedSingletonServices: ['email', 'logger'],
    expectedSessionServices: [],
    description:
      'No wirings in nonexistent directory, only email/logger from session creation',
  },

  // Combination filters
  {
    name: 'Combo: notifications + POST',
    filter: '--tags=notifications --httpMethods=POST',
    expectedSingletonServices: ['email', 'logger', 'sms'],
    expectedSessionServices: [],
    description: 'Notification routes that are POST',
  },
  {
    name: 'Combo: payments + http',
    filter: '--tags=payments --types=http',
    expectedSingletonServices: ['analytics', 'email', 'logger', 'payment'],
    expectedSessionServices: ['storage'],
    description: 'Payment HTTP routes',
  },

  // Wildcard name filters
  {
    name: 'Name: send*',
    filter: '--names=send*',
    expectedSingletonServices: ['email', 'logger', 'sms'],
    expectedSessionServices: [],
    description: 'Routes using sendEmail and sendSMS functions + middleware',
  },
  {
    name: 'Name: process*',
    filter: '--names=process*',
    expectedSingletonServices: ['analytics', 'email', 'logger', 'payment'],
    expectedSessionServices: ['storage'],
    description: 'Routes using processPayment function + middleware',
  },
  {
    name: 'Name: *Payment',
    filter: '--names=*Payment',
    expectedSingletonServices: ['analytics', 'email', 'logger', 'payment'],
    expectedSessionServices: ['storage'],
    description: 'Routes using functions ending with "Payment" + middleware',
  },
  {
    name: 'Name: saveData',
    filter: '--names=saveData',
    expectedSingletonServices: ['email', 'logger'],
    expectedSessionServices: ['storage'],
    description: 'Routes using saveData function',
  },
]
