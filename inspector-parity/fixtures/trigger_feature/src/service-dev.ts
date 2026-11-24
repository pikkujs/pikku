export const devVariant = ({ logger }: { logger: unknown }) => ({
  queue: logger,
})
export const devVariantTwo = ({ logger }: { logger: unknown }) => ({
  queue: logger,
})
export const notAFunction = { kind: 'x' }
const notExported = ({ logger }: { logger: unknown }) => ({ hidden: logger })
export { notExported as _n }
const hiddenOne = 1
export { hiddenOne as renamed }
