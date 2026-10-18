import { z } from 'zod'

export const Trimmed = z.string().transform((s) => s.trim())
