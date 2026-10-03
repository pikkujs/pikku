import cronstrue from 'cronstrue'

export const describeCron = (cron: string) => {
  try {
    const text = cronstrue.toString(cron, { use24HourTimeFormat: true })
    const [, , dayOfMonth, month, dayOfWeek] = cron.trim().split(/\s+/)
    const daily = dayOfMonth === '*' && month === '*' && dayOfWeek === '*'
    return daily && text.startsWith('At ') ? `Every day at ${text.slice(3)}` : text
  } catch {
    return cron
  }
}
