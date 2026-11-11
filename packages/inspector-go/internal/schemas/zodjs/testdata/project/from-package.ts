import { z } from 'zod'
import { Currency, MAX_AMOUNT, SharedAddress } from 'some-shared-schemas'

export const CurrencyField = z.literal(Currency.EUR)
export const Amount = z.number().max(MAX_AMOUNT)
export const Address = SharedAddress
export const Described = z.string().describe(Currency.description)
export const Note = z.string()
