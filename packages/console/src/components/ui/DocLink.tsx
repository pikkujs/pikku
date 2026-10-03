import { Button, Tooltip } from '@pikku/mantine/core'
import { ExternalLink } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

type DocLinkProps = {
  href: string
}

const DocLink: React.FC<DocLinkProps> = ({ href }) => {
  useLocale()
  return (
    <Tooltip label={m.common_docs_link()}>
      <Button
        component="a"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        variant="default"
        color="gray"
        size="xs"
        px="xs"
      >
        <ExternalLink size={14} />
      </Button>
    </Tooltip>
  )
}

export default DocLink
