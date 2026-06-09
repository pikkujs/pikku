import { Button, Tooltip } from '@mantine/core'
import { ExternalLink } from 'lucide-react'

type DocLinkProps = {
  href: string
}

const DocLink: React.FC<DocLinkProps> = ({ href }) => (
  <Tooltip label="Docs">
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

export default DocLink
