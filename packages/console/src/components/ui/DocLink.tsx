import { Button, Tooltip } from '@pikku/mantine/core'
import { ExternalLink } from 'lucide-react'
import { useI18n } from '@pikku/react/i18n'

type DocLinkProps = {
  href: string
}

const DocLink: React.FC<DocLinkProps> = ({ href }) => {
  const { t } = useI18n()
  return (
    <Tooltip label={t('common.docs_link')}>
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
