import { Button, Container, Text, Title } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import classes from './HeroImageRight.module.css'

export function HeroImageRight() {
  return (
    <div className={classes.root}>
      <Container size="lg">
        <div className={classes.inner}>
          <div className={classes.content}>
            <Title className={classes.title}>
              {m.heroimageright__title_start()}
              <Text
                component="span"
                inherit
                variant="gradient"
                gradient={{ from: 'pink', to: 'yellow' }}
              >
                {m.heroimageright__title_highlight()}
              </Text>
              {m.heroimageright__title_end()}
            </Title>

            <Text className={classes.description} mt={30}>
              {m.heroimageright__description()}
            </Text>

            <Button
              variant="gradient"
              gradient={{ from: 'pink', to: 'yellow' }}
              size="xl"
              className={classes.control}
              mt={40}
            >
              {m.heroimageright__get_started()}
            </Button>
          </div>
        </div>
      </Container>
    </div>
  )
}
