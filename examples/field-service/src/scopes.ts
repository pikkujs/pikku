import { defineScope } from '#pikku/scopes/pikku-scope-types.gen.js'

/**
 * What may be done in a service company.
 *
 * Every node is grantable and a parent grants its children, so the nesting is
 * where the boundary goes: a dispatcher holds `jobs` outright, a technician
 * holds `jobs:read` and `jobs:progress` and can move their own work along
 * without being able to hand it to somebody else.
 */
defineScope({
  jobs: {
    displayName: 'Jobs',
    description: 'Work raised against a customer site',
    scopes: {
      read: { description: 'Read jobs' },
      write: { description: 'Raise and edit a job' },
      assign: { description: 'Put a job on a technician' },
      progress: { description: 'Move a job you are assigned to along' },
    },
  },
  visits: {
    displayName: 'Visits',
    description: 'One attendance at a site',
    scopes: {
      read: { description: 'Read the visit history of a job' },
      log: { description: 'Log a visit and its notes' },
    },
  },
  quotes: {
    displayName: 'Quotes',
    description: 'What the work will cost',
    scopes: {
      read: { description: 'Read quotes' },
      create: { description: 'Draft a quote against a job' },
      approve: { description: 'Approve or reject a quote' },
    },
  },
  customers: {
    displayName: 'Customers',
    description: 'The sites this company works on',
    scopes: {
      read: { description: 'Read customers' },
      write: { description: 'Add and edit a customer' },
    },
  },
  reports: {
    displayName: 'Reports',
    description: 'Workload and overdue reporting',
    scopes: {
      read: { description: 'Read reports' },
    },
  },
})
