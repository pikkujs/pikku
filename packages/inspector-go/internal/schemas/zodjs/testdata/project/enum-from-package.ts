import { z } from 'zod'
import { Currency } from 'some-shared-schemas'

export const CurrencyCode = z.enum(
  Object.values(Currency) as [string, ...string[]]
)
