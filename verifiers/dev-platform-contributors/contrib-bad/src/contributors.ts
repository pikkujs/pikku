import { defineContributors } from '@pikku/core/contributors'
import { cycleADev, cycleBDev, dupADev, dupBDev, ghostDev } from './bad.js'

export const contributors = defineContributors({
  'dup-a': { dev: dupADev },
  'dup-b': { dev: dupBDev },
  'needs-ghost': { dev: ghostDev },
  'cycle-a': { dev: cycleADev },
  'cycle-b': { dev: cycleBDev },
})
