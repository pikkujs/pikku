import React, { useState, useEffect, useCallback } from 'react'

import {
  Stack,
  TextInput,
  Textarea,
  Switch,
  Button,
  Group,
  Alert,
  MultiSelect,
  Code,
} from '@mantine/core'
import { Save, X, AlertTriangle, CheckCircle } from 'lucide-react'
import { SidePanelFooter } from '../../panel/SidePanel'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { SectionLabel } from '../../ui/SectionLabel'
import { useTagOptions } from '../../../hooks/useTags'
import {
  useFunctionSource,
  useUpdateFunctionConfig,
  useUpdateFunctionBody,
} from '../../../hooks/useCodeEdit'

interface FunctionEditorProps {
  functionName: string
  sourceFile: string
  exportedName: string
  onClose: () => void
}

export const FunctionEditor: React.FC<FunctionEditorProps> = ({
  functionName,
  sourceFile,
  exportedName,
  onClose,
}) => {
  const { data: source, isLoading } = useFunctionSource(
    sourceFile,
    exportedName,
    true
  )
  const updateConfig = useUpdateFunctionConfig()
  const tagOptions = useTagOptions()
  const updateBody = useUpdateFunctionBody()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [summary, setSummary] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [expose, setExpose] = useState(false)
  const [remote, setRemote] = useState(false)
  const [mcp, setMcp] = useState(false)
  const [readonly_, setReadonly] = useState(false)
  const [approvalRequired, setApprovalRequired] = useState(false)
  const [body, setBody] = useState('')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    if (source) {
      const c = source.config || {}
      setTitle((c.title as string) || '')
      setDescription((c.description as string) || '')
      setSummary((c.summary as string) || '')
      setTags((c.tags as string[]) || [])
      setExpose(c.expose === true)
      setRemote(c.remote === true)
      setMcp(c.mcp === true)
      setReadonly(c.readonly === true)
      setApprovalRequired(c.approvalRequired === true)
      setBody(source.body || '')
    }
  }, [source])

  const handleSaveConfig = useCallback(async () => {
    const original = source?.config || {}
    const changes: Record<string, unknown> = {}

    if (title !== (original.title || '')) changes.title = title || null
    if (description !== (original.description || ''))
      changes.description = description || null
    if (summary !== (original.summary || '')) changes.summary = summary || null

    const origTags = (original.tags as string[]) || []
    if (JSON.stringify(tags) !== JSON.stringify(origTags))
      changes.tags = tags.length > 0 ? tags : null

    if (expose !== (original.expose === true)) changes.expose = expose || null
    if (remote !== (original.remote === true)) changes.remote = remote || null
    if (mcp !== (original.mcp === true)) changes.mcp = mcp || null
    if (readonly_ !== (original.readonly === true))
      changes.readonly = readonly_ || null
    if (approvalRequired !== (original.approvalRequired === true))
      changes.approvalRequired = approvalRequired || null

    if (Object.keys(changes).length === 0 && body === (source?.body || '')) {
      onClose()
      return
    }

    try {
      if (Object.keys(changes).length > 0) {
        await updateConfig.mutateAsync({ sourceFile, exportedName, changes })
      }
      if (body !== (source?.body || '')) {
        await updateBody.mutateAsync({ sourceFile, exportedName, body })
      }
      setSuccessMessage('Saved and rebuilt successfully')
      setTimeout(() => {
        setSuccessMessage(null)
        onClose()
      }, 1500)
    } catch {
      // error is in mutation state
    }
  }, [source, title, description, summary, tags, expose, remote, mcp, readonly_, approvalRequired, body, sourceFile, exportedName, updateConfig, updateBody, onClose])

  const isPending = updateConfig.isPending || updateBody.isPending
  const error = updateConfig.error || updateBody.error

  if (isLoading) {
    return null
  }

  return (
    <>
    <Stack gap="md">
      {successMessage && (
        <Alert
          color="green"
          icon={<CheckCircle size={16} />}
          withCloseButton
          onClose={() => setSuccessMessage(null)}
        >
          {successMessage}
        </Alert>
      )}

      {error && (
        <Alert color="red" icon={<AlertTriangle size={16} />}>
          {(error as Error).message}
        </Alert>
      )}

      <SectionLabel>Metadata</SectionLabel>
      <TextInput
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.currentTarget.value)}
        size="sm"
      />
      <Textarea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.currentTarget.value)}
        autosize
        minRows={2}
        maxRows={6}
        size="sm"
      />
      <TextInput
        label="Summary"
        value={summary}
        onChange={(e) => setSummary(e.currentTarget.value)}
        size="sm"
      />
      <MultiSelect
        label="Tags"
        data={tagOptions}
        value={tags}
        onChange={setTags}
        searchable
        clearable
        size="sm"
        placeholder="Search tags..."
      />

      <SectionLabel>Flags</SectionLabel>
      <Group gap="lg">
        <Switch
          label="expose"
          checked={expose}
          onChange={(e) => setExpose(e.currentTarget.checked)}
          size="sm"
        />
        <Switch
          label="remote"
          checked={remote}
          onChange={(e) => setRemote(e.currentTarget.checked)}
          size="sm"
        />
        <Switch
          label="mcp"
          checked={mcp}
          onChange={(e) => setMcp(e.currentTarget.checked)}
          size="sm"
        />
        <Switch
          label="readonly"
          checked={readonly_}
          onChange={(e) => setReadonly(e.currentTarget.checked)}
          size="sm"
        />
        <Switch
          label="approvalRequired"
          checked={approvalRequired}
          onChange={(e) => setApprovalRequired(e.currentTarget.checked)}
          size="sm"
        />
      </Group>

      {source?.body != null && (
        <>
          <SectionLabel>Function Body</SectionLabel>
          <CodeMirror
            value={body}
            onChange={setBody}
            extensions={[javascript({ typescript: true })]}
            theme="dark"
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              highlightActiveLine: true,
            }}
            style={{
              fontSize: '13px',
              border: '1px solid var(--app-border)',
              borderRadius: '4px',
              overflow: 'hidden',
            }}
          />
        </>
      )}

    </Stack>

    <SidePanelFooter>
      <Group gap="xs" justify="flex-end">
        <Button
          variant="subtle"
          onClick={onClose}
          disabled={isPending}
          leftSection={<X size={14} />}
          size="sm"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSaveConfig}
          loading={isPending}
          leftSection={<Save size={14} />}
          size="sm"
        >
          Save & Rebuild
        </Button>
      </Group>
    </SidePanelFooter>
    </>
  )
}
