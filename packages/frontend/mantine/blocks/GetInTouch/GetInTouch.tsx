import { Button, Group, Paper, SimpleGrid, Text, Textarea, TextInput } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { ContactIconsList } from './ContactIcons'
import classes from './GetInTouch.module.css'

export function GetInTouch() {
  return (
    <Paper shadow="md" radius="lg">
      <div className={classes.wrapper}>
        <div className={classes.contacts}>
          <Text fz="lg" fw={700} className={classes.title} c="white">
            {m.getintouch__contact_info()}
          </Text>

          <ContactIconsList />
        </div>

        <form className={classes.form} onSubmit={(event) => event.preventDefault()}>
          <Text fz="lg" fw={700} className={classes.title}>
            {m.getintouch__title()}
          </Text>

          <div className={classes.fields}>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                label={m.getintouch__name_label()}
                placeholder={m.getintouch__name_placeholder()}
              />
              <TextInput
                label={m.getintouch__email_label()}
                placeholder={m.getintouch__email_placeholder()}
                required
              />
            </SimpleGrid>

            <TextInput
              mt="md"
              label={m.getintouch__subject_label()}
              placeholder={m.getintouch__subject_placeholder()}
              required
            />

            <Textarea
              mt="md"
              label={m.getintouch__message_label()}
              placeholder={m.getintouch__message_placeholder()}
              minRows={3}
            />

            <Group justify="flex-end" mt="md">
              <Button type="submit" className={classes.control}>
                {m.getintouch__send()}
              </Button>
            </Group>
          </div>
        </form>
      </div>
    </Paper>
  )
}
