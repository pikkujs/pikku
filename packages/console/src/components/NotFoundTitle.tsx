import { Button, Container, Group, Text, Title } from '@pikku/mantine/core'
import { useNavigate } from '../router'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import classes from './NotFoundTitle.module.css'

export const NotFoundTitle: React.FC = () => {
  const navigate = useNavigate()
  useLocale()

  const handleGoHome = () => {
    navigate('/')
  }

  return (
    <Container className={classes.root}>
      <div className={classes.label}>404</div>
      <Title className={classes.title}>{m.not_found_title()}</Title>
      <Text c="dimmed" size="lg" ta="center" className={classes.description}>
        {m.not_found_description()}
      </Text>
      <Group justify="center">
        <Button variant="subtle" size="md" onClick={handleGoHome}>
          {m.not_found_go_home()}
        </Button>
      </Group>
    </Container>
  )
}
