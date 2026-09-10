export interface TestScenario {
  name: string
  filter: string
  expectedSingletonServices: string[]
  expectedWireServices: string[]
  expectedAddonBootstrap?: boolean
  expectedGeneratedFiles?: Partial<
    Record<
      'bootstrap' | 'httpWirings' | 'queueWirings' | 'schedulerWirings',
      {
        contains?: string[]
        excludes?: string[]
      }
    >
  >
  description: string
}

export const scenarios: TestScenario[] = [
  // Baseline
  {
    name: 'Baseline (no filters)',
    filter: '',
    expectedSingletonServices: [
      'email',
      'logger',
      'notification',
      'payment',
      'secrets',
      'sms',
      'storage',
      'tracker',
    ],
    expectedWireServices: ['userContext', 'userPreferences'],
    description: 'All services should be included when no filters are applied',
  },

  // Single tag filters
  {
    name: 'Tag: notifications',
    filter: '--tags=notifications',
    expectedSingletonServices: ['email', 'logger', 'secrets', 'sms'],
    expectedWireServices: ['userContext'],
    description: 'Email, sms, logger (middleware) from notification routes',
  },
  {
    name: 'Tag: email',
    filter: '--tags=email',
    expectedSingletonServices: ['email', 'logger', 'secrets'],
    expectedWireServices: ['userContext'],
    description: 'Email (function + permissions), logger (middleware)',
  },
  {
    name: 'Tag: sms',
    filter: '--tags=sms',
    expectedSingletonServices: ['email', 'logger', 'secrets', 'sms'],
    expectedWireServices: [],
    description:
      'SMS (function), logger (middleware), email/logger from session creation',
  },
  {
    name: 'Tag: payments',
    filter: '--tags=payments',
    expectedSingletonServices: [
      'email',
      'logger',
      'payment',
      'secrets',
      'storage',
      'tracker',
    ],
    expectedWireServices: ['userPreferences'],
    description:
      'Payment route uses payment + tracker (function + middleware) + logger + storage (rateLimiter middleware)',
  },
  {
    name: 'Tag: storage',
    filter: '--tags=storage',
    expectedSingletonServices: ['email', 'logger', 'secrets', 'storage'],
    expectedWireServices: ['userContext', 'userPreferences'],
    description:
      'Storage (session service) with email/logger from session creation',
  },

  // Multiple tag filters (OR logic)
  {
    name: 'Tags: notifications,payments',
    filter: '--tags=notifications,payments',
    expectedSingletonServices: [
      'email',
      'logger',
      'payment',
      'secrets',
      'sms',
      'storage',
      'tracker',
    ],
    expectedWireServices: ['userContext', 'userPreferences'],
    description: 'All notification routes + payment route',
  },
  {
    name: 'Tags: email,sms',
    filter: '--tags=email,sms',
    expectedSingletonServices: ['email', 'logger', 'secrets', 'sms'],
    expectedWireServices: ['userContext'],
    description: 'Both email and SMS routes',
  },
  {
    name: 'Tags: notifications,storage',
    filter: '--tags=notifications,storage',
    expectedSingletonServices: ['email', 'logger', 'secrets', 'sms', 'storage'],
    expectedWireServices: ['userContext', 'userPreferences'],
    description: 'All notification + storage routes',
  },
  {
    name: 'Tags: notifications with exclude sms',
    filter: '--tags=notifications --excludeTags=sms',
    expectedSingletonServices: ['email', 'logger', 'secrets'],
    expectedWireServices: ['userContext'],
    description: 'Notification routes, excluding the SMS-tagged handler',
  },
  {
    name: 'Named Filter: notifications_no_sms',
    filter: '--filter=notifications_no_sms',
    expectedSingletonServices: ['email', 'logger', 'secrets'],
    expectedWireServices: ['userContext'],
    description: 'Named filter preset resolves include and exclude tag logic',
  },

  // Wire filters
  {
    name: 'Wire: http',
    filter: '--wires=http',
    expectedSingletonServices: [
      'email',
      'logger',
      'payment',
      'secrets',
      'sms',
      'storage',
      'tracker',
    ],
    expectedWireServices: ['userContext', 'userPreferences'],
    description: 'Only direct HTTP wirings are selected',
    expectedGeneratedFiles: {
      bootstrap: {
        contains: ['./http/pikku-http-wirings.gen.js'],
      },
      httpWirings: {
        contains: ['../../src/functions/http.wiring.js'],
      },
    },
  },
  {
    name: 'Exclude Wires: queue,scheduler',
    filter: '--excludeWires=queue,scheduler',
    expectedSingletonServices: [
      'email',
      'logger',
      'payment',
      'secrets',
      'sms',
      'storage',
      'tracker',
    ],
    expectedWireServices: ['userContext', 'userPreferences'],
    description:
      'Exclude direct queue/scheduler wirings when no surviving workflow path requires them',
  },
  {
    name: 'Wire: queue',
    filter: '--wires=queue',
    expectedSingletonServices: ['email', 'logger', 'notification', 'secrets'],
    expectedWireServices: [],
    description: 'Only queue worker services should be included',
    expectedGeneratedFiles: {
      bootstrap: {
        contains: ['./queue/pikku-queue-workers-wirings.gen.js'],
      },
      queueWirings: {
        contains: ['../../src/background/background.wiring.js'],
      },
    },
  },
  {
    name: 'Wire: scheduler',
    filter: '--wires=scheduler',
    expectedSingletonServices: ['email', 'logger', 'notification', 'secrets'],
    expectedWireServices: [],
    description: 'Only scheduler services should be included',
    expectedGeneratedFiles: {
      bootstrap: {
        contains: ['./scheduler/pikku-schedulers-wirings.gen.js'],
      },
      schedulerWirings: {
        contains: ['../../src/background/background.wiring.js'],
      },
    },
  },

  // HTTP method filters
  {
    name: 'HTTP Method: POST',
    filter: '--httpMethods=POST',
    expectedSingletonServices: [
      'email',
      'logger',
      'notification',
      'payment',
      'secrets',
      'sms',
      'storage',
      'tracker',
    ],
    expectedWireServices: ['userContext', 'userPreferences'],
    description: 'All services should be included (all routes are POST)',
  },
  {
    name: 'HTTP Method: GET',
    filter: '--httpMethods=GET',
    expectedSingletonServices: ['email', 'logger', 'notification', 'secrets'],
    expectedWireServices: [],
    description: 'No GET routes exist, only email/logger from session creation',
  },

  // HTTP route filters
  {
    name: 'HTTP Route: /api/notifications/*',
    filter: '--httpRoutes=/api/notifications/*',
    expectedSingletonServices: [
      'email',
      'logger',
      'notification',
      'secrets',
      'sms',
    ],
    expectedWireServices: ['userContext'],
    description: 'Only notification routes',
  },
  {
    name: 'HTTP Route: /api/payments/*',
    filter: '--httpRoutes=/api/payments/*',
    expectedSingletonServices: [
      'email',
      'logger',
      'notification',
      'payment',
      'secrets',
      'storage',
      'tracker',
    ],
    expectedWireServices: ['userPreferences'],
    description: 'Only payment routes',
  },
  {
    name: 'HTTP Route: /api/storage/*',
    filter: '--httpRoutes=/api/storage/*',
    expectedSingletonServices: [
      'email',
      'logger',
      'notification',
      'secrets',
      'storage',
    ],
    expectedWireServices: ['userContext', 'userPreferences'],
    description: 'Only storage routes',
  },

  // Directory filters
  {
    name: 'Directory: src/functions',
    filter: '--directories=src/functions',
    expectedSingletonServices: [
      'email',
      'logger',
      'notification',
      'payment',
      'secrets',
      'sms',
      'storage',
      'tracker',
    ],
    expectedWireServices: ['userContext', 'userPreferences'],
    description:
      'All services should be included (all wirings are in src/functions)',
  },
  {
    name: 'Directory: src/nonexistent',
    filter: '--directories=src/nonexistent',
    expectedSingletonServices: ['email', 'logger', 'notification', 'secrets'],
    expectedWireServices: [],
    description:
      'No wirings in nonexistent directory, only email/logger from session creation',
  },

  // Combination filters
  {
    name: 'Combo: notifications + POST',
    filter: '--tags=notifications --httpMethods=POST',
    expectedSingletonServices: ['email', 'logger', 'secrets', 'sms'],
    expectedWireServices: ['userContext'],
    description: 'Notification routes that are POST',
  },
  {
    name: 'Combo: payments + http',
    filter: '--tags=payments --wires=http',
    expectedSingletonServices: [
      'email',
      'logger',
      'payment',
      'secrets',
      'storage',
      'tracker',
    ],
    expectedWireServices: ['userPreferences'],
    description: 'Payment HTTP routes',
  },

  // Wildcard name filters
  {
    name: 'Name: send*',
    filter: '--names=send*',
    expectedSingletonServices: ['email', 'logger', 'secrets', 'sms'],
    expectedWireServices: ['userContext'],
    description: 'Routes using sendEmail and sendSMS functions + middleware',
  },
  {
    name: 'Name: process*',
    filter: '--names=process*',
    expectedSingletonServices: [
      'email',
      'logger',
      'notification',
      'payment',
      'secrets',
      'storage',
      'tracker',
    ],
    expectedWireServices: ['userPreferences'],
    description: 'Routes using processPayment function + middleware',
  },
  {
    name: 'Name: *Payment',
    filter: '--names=*Payment',
    expectedSingletonServices: [
      'email',
      'logger',
      'payment',
      'secrets',
      'storage',
      'tracker',
    ],
    expectedWireServices: ['userPreferences'],
    description: 'Routes using functions ending with "Payment" + middleware',
  },
  {
    name: 'Name: saveData',
    filter: '--names=saveData',
    expectedSingletonServices: ['email', 'logger', 'secrets', 'storage'],
    expectedWireServices: ['userContext', 'userPreferences'],
    description: 'Routes using saveData function',
  },

  // Addon package tests
  {
    name: 'Addon: testAddon included',
    filter: '--names=testAddon',
    expectedSingletonServices: ['email', 'logger', 'secrets'],
    expectedWireServices: [],
    expectedAddonBootstrap: true,
    description:
      'When addon function is called via RPC, addon bootstrap should be bundled but NOT addon services (noop is internal to addon)',
  },
  {
    name: 'Addon: not called - excluded',
    filter: '--names=sendEmail',
    expectedSingletonServices: ['email', 'logger', 'secrets'],
    expectedWireServices: ['userContext'],
    expectedAddonBootstrap: false,
    description:
      'Addon bootstrap is excluded when no kept function or wiring invokes the addon',
  },

  // Versioned function filters
  {
    name: 'Name: analyzeData@v1',
    filter: '--names=analyzeData@v1',
    expectedSingletonServices: ['email', 'logger', 'secrets'],
    expectedWireServices: [],
    description:
      'Only v1 version included — uses email (function) + logger/secrets (session creation)',
  },
  {
    name: 'Name: analyzeData (latest)',
    filter: '--names=analyzeData',
    expectedSingletonServices: [
      'email',
      'logger',
      'secrets',
      'storage',
      'tracker',
    ],
    expectedWireServices: [],
    description:
      'Latest version (v2) uses tracker + storage, plus email/logger/secrets from session creation',
  },
  {
    name: 'Name: analyzeData*',
    filter: '--names=analyzeData*',
    expectedSingletonServices: [
      'email',
      'logger',
      'secrets',
      'storage',
      'tracker',
    ],
    expectedWireServices: [],
    description:
      'All versions combined — v1 uses email, v2 uses tracker + storage',
  },
  {
    name: 'Tag: analyze',
    filter: '--tags=analyze',
    expectedSingletonServices: [
      'email',
      'logger',
      'secrets',
      'storage',
      'tracker',
    ],
    expectedWireServices: [],
    description: 'Both versioned analyze routes share the "analyze" tag',
  },

  // wireHTTPRoutes group tests
  {
    name: 'HTTP Route Group: /api/grouped/*',
    filter: '--httpRoutes=/api/grouped/*',
    expectedSingletonServices: [
      'email',
      'logger',
      'notification',
      'payment',
      'secrets',
      'tracker',
    ],
    expectedWireServices: ['userContext', 'userPreferences'],
    description:
      'Filter by wireHTTPRoutes basePath - includes all routes in the group (sendEmail + processPayment)',
  },
  {
    name: 'Tag: grouped',
    filter: '--tags=grouped',
    expectedSingletonServices: [
      'email',
      'logger',
      'payment',
      'secrets',
      'tracker',
    ],
    expectedWireServices: ['userContext', 'userPreferences'],
    description:
      'Filter by group tag - includes all routes with "grouped" tag from wireHTTPRoutes',
  },
]
