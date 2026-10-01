import { Button, Group, SimpleGrid, Textarea, TextInput, Title } from '@pikku/mantine/core'
import { useForm } from '@mantine/form'
import { m } from '@/i18n/messages'

export function GetInTouchSimple() {
  const form = useForm({
    initialValues: {
      name: '',
      email: '',
      subject: '',
      message: '',
    },
    validate: {
      name: (value) => value.trim().length < 2,
      email: (value) => !/^\S+@\S+$/.test(value),
      subject: (value) => value.trim().length === 0,
    },
  })

  return (
    <form onSubmit={form.onSubmit(() => {})}>
      <Title order={2} size="h1" fw={900} ta="center">
        {m.getintouchsimple__title()}
      </Title>

      <SimpleGrid cols={{ base: 1, sm: 2 }} mt="xl">
        <TextInput
          label={m.getintouchsimple__name_label()}
          placeholder={m.getintouchsimple__name_placeholder()}
          name="name"
          variant="filled"
          {...form.getInputProps('name')}
        />
        <TextInput
          label={m.getintouchsimple__email_label()}
          placeholder={m.getintouchsimple__email_placeholder()}
          name="email"
          variant="filled"
          {...form.getInputProps('email')}
        />
      </SimpleGrid>

      <TextInput
        label={m.getintouchsimple__subject_label()}
        placeholder={m.getintouchsimple__subject_placeholder()}
        mt="md"
        name="subject"
        variant="filled"
        {...form.getInputProps('subject')}
      />
      <Textarea
        mt="md"
        label={m.getintouchsimple__message_label()}
        placeholder={m.getintouchsimple__message_placeholder()}
        maxRows={10}
        minRows={5}
        autosize
        name="message"
        variant="filled"
        {...form.getInputProps('message')}
      />

      <Group justify="center" mt="xl">
        <Button type="submit" size="md">
          {m.getintouchsimple__send()}
        </Button>
      </Group>
    </form>
  )
}
