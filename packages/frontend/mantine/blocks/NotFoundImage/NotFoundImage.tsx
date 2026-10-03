import { Button, Container, Image, SimpleGrid, Text, Title } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import classes from './NotFoundImage.module.css'

// Illustration URL is opaque, not translatable copy — keep it a plain string.
const image = 'https://ui.mantine.dev/404.svg'

export function NotFoundImage() {
  return (
    <Container className={classes.root}>
      <SimpleGrid spacing={{ base: 40, sm: 80 }} cols={{ base: 1, sm: 2 }}>
        <Image src={image} className={classes.mobileImage} alt={m.notfoundimage__alt()} />
        <div>
          <Title className={classes.title}>{m.notfoundimage__title()}</Title>
          <Text c="dimmed" size="lg">
            {m.notfoundimage__description()}
          </Text>
          <Button variant="outline" size="md" mt="xl" className={classes.control}>
            {m.notfoundimage__back()}
          </Button>
        </div>
        <Image src={image} className={classes.desktopImage} alt={m.notfoundimage__alt()} />
      </SimpleGrid>
    </Container>
  )
}
