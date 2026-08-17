/**
 * Synthetic principals — the platform credential owner, fabric service users
 * and agent actors — are not people, so they never belong in a directory a
 * human picks from.
 */
export const isPerson = (row: any) =>
  row.fabric !== true && row.actor !== true && row.id !== 'pikku-platform'
