import type { ComponentPropsWithoutRef } from 'react'
import { Twitter } from 'lucide-react'
import { Button, type ButtonProps } from '@pikku/mantine/core'

export function TwitterButton(props: ButtonProps & ComponentPropsWithoutRef<'button'>) {
  return <Button leftSection={<Twitter size={16} color="#00ACEE" />} variant="default" {...props} />
}
