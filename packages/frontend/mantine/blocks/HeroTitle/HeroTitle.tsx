import { Button, Container, Group, Text } from '@pikku/mantine/core'
import { Github } from 'lucide-react'
import { m } from '@/i18n/messages'
import classes from './HeroTitle.module.css'

export function HeroTitle() {
  return (
    <div className={classes.wrapper}>
      <Container size={700} className={classes.inner}>
        <h1 className={classes.title}>
          {m.herotitle__title_start()}
          <Text component="span" variant="gradient" gradient={{ from: 'blue', to: 'cyan' }} inherit>
            {m.herotitle__title_highlight()}
          </Text>
          {m.herotitle__title_end()}
        </h1>

        <Text className={classes.description} c="dimmed">
          {m.herotitle__description()}
        </Text>

        <Group className={classes.controls}>
          <Button
            size="xl"
            className={classes.control}
            variant="gradient"
            gradient={{ from: 'blue', to: 'cyan' }}
          >
            {m.herotitle__get_started()}
          </Button>

          <Button
            component="a"
            href="https://github.com/mantinedev/mantine"
            size="xl"
            variant="default"
            className={classes.control}
            leftSection={<Github size={20} />}
          >
            {m.herotitle__github()}
          </Button>
        </Group>
      </Container>
    </div>
  )
}
