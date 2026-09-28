import React from 'react'
import { Stack } from '@pikku/mantine/core'

/** The centred column a card-based screen is laid out in; the page frame behind it turns transparent. */
export const CardsPage: React.FC<{
  children: React.ReactNode
  maw?: number
}> = ({ children, maw = 1120 }) => (
  <Stack gap={16} w="100%" maw={maw} mx="auto" data-page-surface="cards">
    {children}
  </Stack>
)
