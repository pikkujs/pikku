import { Button, Image, Text, TextInput, Title } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import classes from './EmailBanner.module.css'

// Illustration is opaque decorative data, not UI copy — a plain URL string.
const image =
  'https://raw.githubusercontent.com/mantinedev/ui.mantine.dev/master/lib/EmailBanner/image.svg'

export function EmailBanner() {
  return (
    <div className={classes.wrapper}>
      <div className={classes.body}>
        <Title className={classes.title}>{m.emailbanner__title()}</Title>
        <Text fw={500} fz="lg" mb={5}>
          {m.emailbanner__subtitle()}
        </Text>
        <Text fz="sm" c="dimmed">
          {m.emailbanner__description()}
        </Text>

        <div className={classes.controls}>
          <TextInput
            placeholder={m.emailbanner__email_placeholder()}
            classNames={{ input: classes.input, root: classes.inputWrapper }}
            radius="md"
            size="md"
          />
          <Button className={classes.control} radius="md" size="md">
            {m.emailbanner__subscribe()}
          </Button>
        </div>
      </div>
      <Image src={image} className={classes.image} alt={m.emailbanner__image_alt()} />
    </div>
  )
}
