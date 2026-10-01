import { useRef } from 'react'
import { CloudUpload, Download, X } from 'lucide-react'
import { Button, Group, Text, useMantineTheme } from '@pikku/mantine/core'
import { Dropzone, MIME_TYPES } from '@mantine/dropzone'
import { m } from '@/i18n/messages'
import classes from './DropzoneButton.module.css'

export function DropzoneButton() {
  const theme = useMantineTheme()
  const openRef = useRef<() => void>(null)

  return (
    <div className={classes.wrapper}>
      <Dropzone
        openRef={openRef}
        onDrop={() => {}}
        className={classes.dropzone}
        radius="md"
        accept={[MIME_TYPES.pdf]}
        maxSize={30 * 1024 ** 2}
        aria-label={m.dropzonebutton__aria_drop()}
      >
        <div style={{ pointerEvents: 'none' }}>
          <Group justify="center">
            <Dropzone.Accept>
              <Download size={50} color={theme.colors.blue[6]} strokeWidth={1.5} />
            </Dropzone.Accept>
            <Dropzone.Reject>
              <X size={50} color={theme.colors.red[6]} strokeWidth={1.5} />
            </Dropzone.Reject>
            <Dropzone.Idle>
              <CloudUpload size={50} strokeWidth={1.5} className={classes.icon} />
            </Dropzone.Idle>
          </Group>

          <Text ta="center" fw={700} fz="lg" mt="xl">
            <Dropzone.Accept>{m.dropzonebutton__drop_files()}</Dropzone.Accept>
            <Dropzone.Reject>{m.dropzonebutton__reject()}</Dropzone.Reject>
            <Dropzone.Idle>{m.dropzonebutton__idle()}</Dropzone.Idle>
          </Text>

          <Text className={classes.description}>{m.dropzonebutton__description()}</Text>
        </div>
      </Dropzone>

      <Button className={classes.control} size="md" radius="xl" onClick={() => openRef.current?.()}>
        {m.dropzonebutton__select()}
      </Button>
    </div>
  )
}
