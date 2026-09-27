import React, { useState } from 'react'
import { Button } from '@pikku/mantine/core'
import { Check, ClipboardCopy } from 'lucide-react'
import { m } from '@/i18n/messages'

/**
 * The OSS action for a multi-package selection: hand the instruction to
 * whichever coding agent the user already runs, since the console has no
 * sandbox to verify an upgrade in.
 */
export const CopyUpgradePromptButton: React.FC<{ prompt: string }> = ({
  prompt,
}) => {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      size="xs"
      variant="default"
      data-testid="security-copy-upgrade-prompt"
      leftSection={
        copied ? <Check size={14} /> : <ClipboardCopy size={14} />
      }
      onClick={async () => {
        await navigator.clipboard.writeText(prompt)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      {copied ? m.security_prompt_copied() : m.security_copy_prompt()}
    </Button>
  )
}
