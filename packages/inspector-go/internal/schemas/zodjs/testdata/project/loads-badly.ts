import { z } from 'zod'
import { config } from 'some-config'

const table = `${config.prefix}_orders`

export const Row = z.object({ table: z.literal(table) })
