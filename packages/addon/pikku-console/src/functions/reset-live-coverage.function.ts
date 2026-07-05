import { pikkuFunc } from '#pikku'

export const resetLiveCoverage = pikkuFunc<null, { enabled: boolean }>({
  title: 'Reset Live Coverage',
  description:
    'Clears V8 precise-coverage call counts so the next takeLiveCoverage snapshot is attributable to a single scenario run. Reports enabled: false when the server was not started with coverage enabled.',
  expose: true,
  func: async ({ coverageService }) => {
    if (!coverageService) return { enabled: false }
    await coverageService.reset()
    return { enabled: true }
  },
})
