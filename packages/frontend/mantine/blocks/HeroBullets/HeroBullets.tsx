import { Check } from 'lucide-react'
import { Button, Container, Group, Image, List, Text, ThemeIcon, Title } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import classes from './HeroBullets.module.css'

// Decorative sample illustration; swap for your own asset.
const SAMPLE_IMAGE =
  'https://raw.githubusercontent.com/mantinedev/ui.mantine.dev/master/lib/HeroBullets/image.svg'

export function HeroBullets() {
  return (
    <Container size="md">
      <div className={classes.inner}>
        <div className={classes.content}>
          <Title className={classes.title}>
            {m.herobullets__title_a()}
            <span className={classes.highlight}>{m.herobullets__title_modern()}</span>
            {m.herobullets__title_react()}
            <br />
            {m.herobullets__title_components()}
          </Title>
          <Text c="dimmed" mt="md">
            {m.herobullets__description()}
          </Text>

          <List
            mt={30}
            spacing="sm"
            size="sm"
            icon={
              <ThemeIcon size={20} radius="xl">
                <Check size={12} strokeWidth={1.5} />
              </ThemeIcon>
            }
          >
            <List.Item>
              <b>{m.herobullets__bullet1_bold()}</b>
              {m.herobullets__bullet1_text()}
            </List.Item>
            <List.Item>
              <b>{m.herobullets__bullet2_bold()}</b>
              {m.herobullets__bullet2_text()}
            </List.Item>
            <List.Item>
              <b>{m.herobullets__bullet3_bold()}</b>
              {m.herobullets__bullet3_text()}
            </List.Item>
          </List>

          <Group mt={30}>
            <Button radius="xl" size="md" className={classes.control}>
              {m.herobullets__get_started()}
            </Button>
            <Button variant="default" radius="xl" size="md" className={classes.control}>
              {m.herobullets__source_code()}
            </Button>
          </Group>
        </div>
        <Image src={SAMPLE_IMAGE} className={classes.image} alt="" />
      </div>
    </Container>
  )
}
