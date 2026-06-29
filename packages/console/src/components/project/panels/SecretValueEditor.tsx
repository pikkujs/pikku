import React, { useEffect, useState } from 'react'
import {
  Stack,
  Box,
  Button,
  Textarea,
  Alert,
  SegmentedControl,
  Loader,
  Text,
  Code,
  Group,
  ActionIcon,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { useI18n } from '@pikku/react/i18n'
import { Save, AlertTriangle, CheckCircle, Eye, Pencil } from 'lucide-react'
import { useSecretValue, useSetSecret } from '../../../hooks/useSecrets'
import { useSchema } from '../../../hooks/useWirings'
import { SchemaForm } from '../../ui/SchemaForm'
import { SectionLabel } from '../../ui/SectionLabel'
import { useConsoleEditable } from '../../../context/ConsoleEditableContext'

const OAUTH2_CLIENT_SCHEMA = {
  type: 'object',
  properties: {
    clientId: { type: 'string', title: 'Client ID' },
    clientSecret: { type: 'string', title: 'Client Secret' },
  },
  required: ['clientId'],
}

interface SecretValueEditorProps {
  secretId: string | undefined
  schemaName: string | undefined
  isOAuth2?: boolean
}

export const SecretValueEditor: React.FC<SecretValueEditorProps> = ({
  secretId,
  schemaName,
  isOAuth2,
}) => {
  const { t } = useI18n()
  const editable = useConsoleEditable()
  const [retrieved, setRetrieved] = useState(false)
  const [editing, setEditing] = useState(false)
  const [mode, setMode] = useState<string>('form')
  const [jsonValue, setJsonValue] = useState<string>('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const { data: secretData, isLoading: secretLoading } = useSecretValue(
    secretId,
    retrieved
  )
  const { data: schema } = useSchema(schemaName)
  const setSecretMutation = useSetSecret()

  const effectiveSchema =
    schema || (isOAuth2 ? OAUTH2_CLIENT_SCHEMA : undefined)
  const hasSchema = !!effectiveSchema
  const currentValue = secretData?.exists ? secretData.value : null

  useEffect(() => {
    if (secretData) {
      setJsonValue(
        currentValue != null ? JSON.stringify(currentValue, null, 2) : ''
      )
    }
  }, [secretData, currentValue])

  if (!secretId) {
    return null
  }

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(null), 3000)
  }

  const handleFormSubmit = (formData: any) => {
    setSecretMutation.mutate(
      { secretId, value: formData },
      {
        onSuccess: () => {
          showSuccess('Secret saved successfully')
          setEditing(false)
        },
      }
    )
  }

  const handleJsonSubmit = () => {
    setJsonError(null)
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonValue)
    } catch {
      setJsonError('Invalid JSON')
      return
    }
    setSecretMutation.mutate(
      { secretId, value: parsed },
      {
        onSuccess: () => {
          showSuccess('Secret saved successfully')
          setEditing(false)
        },
      }
    )
  }

  if (!retrieved) {
    return (
      <Box>
        <SectionLabel>{t('secret_editor.secret_value')}</SectionLabel>
        <Button
          variant="light"
          leftSection={<Eye size={16} />}
          onClick={() => setRetrieved(true)}
          size="sm"
        >
          {t('secret_editor.retrieve_secret_value')}
        </Button>
      </Box>
    )
  }

  if (secretLoading) {
    return (
      <Box>
        <SectionLabel>{t('secret_editor.secret_value')}</SectionLabel>
        <Loader size="sm" />
      </Box>
    )
  }

  const effectiveMode = hasSchema ? mode : 'json'

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center">
        <SectionLabel>{t('secret_editor.secret_value')}</SectionLabel>
        <Group gap="xs" align="center">
          {!editing && editable && (
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={() => setEditing(true)}
              title={t('secret_editor.edit_secret_value')}
            >
              <Pencil size={14} />
            </ActionIcon>
          )}
          {hasSchema && (
            <SegmentedControl
              value={effectiveMode}
              onChange={setMode}
              data={[
                { label: t('secret_editor.form'), value: 'form' },
                { label: t('secret_editor.json'), value: 'json' },
              ]}
              size="sm"
              style={{ width: 'auto' }}
            />
          )}
        </Group>
      </Group>

      {successMessage && (
        <Alert icon={<CheckCircle size={16} />} color="green" variant="light">
          {asI18n(successMessage)}
        </Alert>
      )}

      {setSecretMutation.isError && (
        <Alert icon={<AlertTriangle size={16} />} color="red" variant="light">
          {t('secret_editor.failed_to_save_secret')}
        </Alert>
      )}

      {!secretData?.exists && !editing && (
        <Text size="sm" c="dimmed">
          {t('secret_editor.no_value_set')}
        </Text>
      )}

      {!editing ? (
        <Stack gap="xs">
          {secretData?.exists &&
            (effectiveMode === 'form' && hasSchema ? (
              <Box style={{ pointerEvents: 'none', opacity: 0.8 }}>
                <SchemaForm
                  schema={effectiveSchema as any}
                  onSubmit={() => {}}
                  initialData={currentValue ?? undefined}
                >
                  <></>
                </SchemaForm>
              </Box>
            ) : (
              <Code
                block
                style={{
                  whiteSpace: 'pre-wrap',
                  maxHeight: 300,
                  overflow: 'auto',
                }}
              >
                {JSON.stringify(currentValue, null, 2)}
              </Code>
            ))}
        </Stack>
      ) : (
        <Stack gap="sm">
          {effectiveMode === 'form' && hasSchema ? (
            <SchemaForm
              schema={effectiveSchema as any}
              onSubmit={handleFormSubmit}
              submitting={setSecretMutation.isPending}
              submitLabel={t('secret_editor.save')}
              initialData={currentValue ?? undefined}
            >
              <Group mt="sm" gap="xs" justify="flex-end">
                <Button variant="subtle" onClick={() => setEditing(false)}>
                  {t('secret_editor.cancel')}
                </Button>
                <Button
                  type="submit"
                  leftSection={<Save size={16} />}
                  loading={setSecretMutation.isPending}
                >
                  {t('secret_editor.save')}
                </Button>
              </Group>
            </SchemaForm>
          ) : (
            <Stack gap="xs">
              <Textarea
                value={jsonValue}
                onChange={(e) => {
                  setJsonValue(e.currentTarget.value)
                  setJsonError(null)
                }}
                placeholder={t('secret_editor.json_placeholder')}
                autosize
                minRows={4}
                maxRows={12}
                styles={{
                  input: { fontFamily: 'monospace', fontSize: '13px' },
                }}
              />
              {jsonError && (
                <Alert
                  icon={<AlertTriangle size={16} />}
                  color="red"
                  variant="light"
                >
                  {asI18n(jsonError)}
                </Alert>
              )}
              <Group gap="xs" justify="flex-end">
                <Button variant="subtle" onClick={() => setEditing(false)}>
                  {t('secret_editor.cancel')}
                </Button>
                <Button
                  leftSection={<Save size={16} />}
                  loading={setSecretMutation.isPending}
                  onClick={handleJsonSubmit}
                >
                  {t('secret_editor.save')}
                </Button>
              </Group>
            </Stack>
          )}
        </Stack>
      )}
    </Stack>
  )
}
