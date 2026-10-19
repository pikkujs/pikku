/**
 * The people this app is for, and the people its scenarios run as.
 *
 * Four of them, and the fourth is the point: Maya works for a different service
 * company. A multitenant claim tested only by people inside one tenant is not
 * tested at all, so `maya` exists to be refused — every scenario that asserts a
 * boundary runs a step as her and expects a 404.
 *
 * Addresses are never written down: each is derived from the persona id and
 * `scenarios.emailDomain`, so `theo` signs in as theo@actors.local.
 */
import { definePersonas } from '#pikku/scopes/pikku-personas.gen.js'

definePersonas({
  dana: {
    name: 'Dana',
    jobTitle: 'Dispatcher at Northwind Heating',
    description: 'Decides who goes where, and signs off what it costs',
    roles: ['dispatcher'],
    personality:
      'Runs the board in her head. Wants the whole day on one screen and gets impatient with anything that needs three clicks to reassign a job.',
    goals: ['Get every urgent job on a van before ten', 'Keep quotes moving'],
    account: {},
  },
  theo: {
    name: 'Theo',
    jobTitle: 'Gas engineer at Northwind Heating',
    description: 'On site all day, mostly with cold hands',
    roles: ['technician'],
    personality:
      'Types as little as possible. Dictates notes from the van and expects them to be on the job before he has driven off.',
    goals: ['Close the job without going back to the office'],
    disposition: 'careless',
    account: {},
  },
  casey: {
    name: 'Casey',
    jobTitle: 'Site manager, Harrow Court Flats',
    description: 'The customer, not the contractor',
    roles: ['customerContact'],
    personality:
      'Wants to know when somebody is coming and nothing else. Reads on a phone.',
    goals: ['Find out whether anyone is attending today'],
    account: {},
  },
  /**
   * A dispatcher at the OTHER company, holding exactly the same role as Dana.
   * She is what proves the boundary is a tenant boundary and not a permission
   * one: identical scopes, no access.
   */
  maya: {
    name: 'Maya',
    jobTitle: 'Dispatcher at Southgate Electrical',
    description: 'A different tenant entirely',
    roles: ['dispatcher'],
    personality:
      'Has no idea Northwind exists, and must never be shown that it does.',
    goals: ['Run her own board'],
    account: {},
  },
})
