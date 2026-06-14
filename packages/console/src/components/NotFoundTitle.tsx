import { Button, Container, Group, Text, Title } from '@pikku/mantine/core'
import { useNavigate } from '../router'
import { useI18n } from '@pikku/react/i18n'
import classes from './NotFoundTitle.module.css'

export const NotFoundTitle: React.FC = () => {
  const navigate = useNavigate()
  const { t } = useI18n()

  const handleGoHome = () => {
    navigate('/')
  }

  return (
    <Container className={classes.root}>
      <div className={classes.label}>404</div>
      <Title className={classes.title}>{t('not_found.title')}</Title>
      <Text c="dimmed" size="lg" ta="center" className={classes.description}>
        {t('not_found.description')}
      </Text>
      <Group justify="center">
        <Button variant="subtle" size="md" onClick={handleGoHome}>
          {t('not_found.go_home')}
        </Button>
      </Group>
    </Container>
  )
}
