import { Instagram, Twitter, Youtube } from 'lucide-react'
import {
  ActionIcon,
  Button,
  Group,
  SimpleGrid,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@pikku/mantine/core'
import { asI18n, m } from '@/i18n/messages'
import { ContactIconsList } from './ContactIcons'
import classes from './ContactUs.module.css'

// Social handles are brand names (opaque), so labels are asI18n(...).
const social = [
  { Icon: Twitter, label: asI18n('Twitter') },
  { Icon: Youtube, label: asI18n('Youtube') },
  { Icon: Instagram, label: asI18n('Instagram') },
]

export function ContactUs() {
  const icons = social.map(({ Icon, label }, index) => (
    <ActionIcon
      key={index}
      size={28}
      className={classes.social}
      variant="transparent"
      aria-label={label}
    >
      <Icon size={22} strokeWidth={1.5} />
    </ActionIcon>
  ))

  return (
    <div className={classes.wrapper}>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={50}>
        <div>
          <Title className={classes.title}>{m.contactus__title()}</Title>
          <Text className={classes.description} mt="sm" mb={30}>
            {m.contactus__description()}
          </Text>

          <ContactIconsList />

          <Group mt="xl">{icons}</Group>
        </div>

        <div className={classes.form}>
          <TextInput
            label={m.contactus__email_label()}
            placeholder={m.contactus__email_placeholder()}
            required
            radius="md"
            classNames={{ input: classes.input, label: classes.inputLabel }}
          />
          <TextInput
            label={m.contactus__name_label()}
            placeholder={m.contactus__name_placeholder()}
            mt="md"
            radius="md"
            classNames={{ input: classes.input, label: classes.inputLabel }}
          />
          <Textarea
            required
            label={m.contactus__message_label()}
            placeholder={m.contactus__message_placeholder()}
            minRows={4}
            mt="md"
            radius="md"
            classNames={{ input: classes.input, label: classes.inputLabel }}
          />

          <Group justify="flex-end" mt="md">
            <Button className={classes.control} radius="md">
              {m.contactus__send()}
            </Button>
          </Group>
        </div>
      </SimpleGrid>
    </div>
  )
}
