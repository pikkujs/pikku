import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, Group, Text, useMantineColorScheme } from '@pikku/mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import { ChevronRight, FileCode, Save } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useSearchParams } from '../router'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import { usePageOptionsDismiss } from '../context/PageOptionsProvider'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import { ConsoleLoading } from '../components/ui/ConsoleLoading'
import { FileTree } from '../components/code/FileTree'
import { FilePicker, filePicker } from '../components/code/FilePicker'

function languageFromPath(path: string): string {
  const ext = path.split('.').pop() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    mts: 'typescript',
    cts: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    jsonc: 'json',
    scss: 'scss',
    less: 'less',
    xml: 'xml',
    svg: 'xml',
    py: 'python',
    go: 'go',
    rs: 'rust',
    graphql: 'graphql',
    dockerfile: 'dockerfile',
    md: 'markdown',
    css: 'css',
    html: 'html',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'shell',
    toml: 'toml',
    sql: 'sql',
    env: 'plaintext',
  }
  return map[ext] ?? 'plaintext'
}

/** The open file's path as a breadcrumb: folders dimmed, the file name bright; display only. */
const PathCrumbs: React.FC<{ path: string }> = ({ path }) => {
  const parts = path.split('/')
  return (
    <Group component="span" gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <ChevronRight
              size={14}
              style={{ flexShrink: 0, color: 'var(--mantine-color-dimmed)' }}
            />
          )}
          <Text
            component="span"
            fz={15}
            fw={i === parts.length - 1 ? 600 : 400}
            c={i === parts.length - 1 ? undefined : 'dimmed'}
            style={{ whiteSpace: 'nowrap' }}
          >
            {asI18n(part)}
          </Text>
        </React.Fragment>
      ))}
    </Group>
  )
}

const FileTreeRail: React.FC<{
  selectedPath: string | null
  onSelect: (path: string) => void
}> = ({ selectedPath, onSelect }) => {
  const dismiss = usePageOptionsDismiss()
  return (
    <Box p="xs" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <FileTree
        dirPath=""
        depth={0}
        selectedPath={selectedPath}
        onSelect={(path) => {
          onSelect(path)
          dismiss()
        }}
      />
    </Box>
  )
}

export const CodePage: React.FC = () => {
  useLocale()
  const rpc = usePikkuRPC()
  const { colorScheme } = useMantineColorScheme()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedPath = searchParams.get('file')

  const queryClient = useQueryClient()
  const { data: fileData, isLoading: fileLoading } = useQuery({
    queryKey: ['project-file', selectedPath],
    queryFn: () => rpc.invoke('console:readProjectFile', { path: selectedPath! }),
    enabled: !!selectedPath,
    staleTime: 10_000,
  })

  const [draft, setDraft] = useState<string | null>(null)
  useEffect(() => setDraft(null), [selectedPath, fileData?.content])
  const saved = fileData?.content ?? ''
  const dirty = draft !== null && draft !== saved
  const editable = !!fileData && !fileData.binary && !fileData.truncated

  const save = useMutation({
    mutationFn: (content: string) =>
      rpc.invoke('console:writeProjectFile', { path: selectedPath!, content }),
    onSuccess: (_, content) =>
      queryClient.setQueryData(['project-file', selectedPath], { ...fileData!, content }),
  })
  const [mounted, setMounted] = useState<Parameters<OnMount> | null>(null)
  useEffect(() => {
    const model = mounted?.[0].getModel()
    if (!mounted || !model || !selectedPath || !editable) return
    const monaco = mounted[1]
    let cancelled = false
    const timer = setTimeout(
      () =>
        rpc
          .invoke('console:getFileDiagnostics', {
            path: selectedPath,
            content: draft ?? undefined,
          })
          .then(({ diagnostics }) => {
            if (cancelled || model.isDisposed()) return
            monaco.editor.setModelMarkers(
              model,
              'pikku-ts',
              diagnostics.map((d) => ({
                message: d.message,
                code: String(d.code),
                source: 'ts',
                severity:
                  d.severity === 'error'
                    ? monaco.MarkerSeverity.Error
                    : d.severity === 'warning'
                      ? monaco.MarkerSeverity.Warning
                      : monaco.MarkerSeverity.Info,
                startLineNumber: d.startLine,
                startColumn: d.startColumn,
                endLineNumber: d.endLine,
                endColumn: d.endColumn,
              }))
            )
          })
          .catch(() => {}),
      draft === null ? 0 : 400
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [mounted, selectedPath, draft, saved, editable, rpc])

  const saveRef = useRef<() => void>(() => {})
  saveRef.current = () => {
    if (dirty && editable && !save.isPending) save.mutate(draft!)
  }
  const beforeMount: BeforeMount = (monaco) => {
    for (const defaults of [
      monaco.languages.typescript.typescriptDefaults,
      monaco.languages.typescript.javascriptDefaults,
    ])
      defaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: true,
      })
  }
  const onMount: OnMount = (editor, monaco) => {
    setMounted([editor, monaco])
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current())
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, () => filePicker.open())
  }

  const editorBody = !selectedPath ? (
    <EmptyStatePlaceholder
      icon={FileCode}
      title={m.code_select_file_title()}
      description={m.code_select_file_subtitle()}
      docsHref="https://pikku.dev/docs"
    />
  ) : fileLoading ? (
    <ConsoleLoading />
  ) : (
    <Editor
      key={selectedPath}
      height="100%"
      path={selectedPath}
      language={languageFromPath(selectedPath)}
      defaultValue={saved}
      onChange={(value) => setDraft(value ?? '')}
      beforeMount={beforeMount}
      onMount={onMount}
      theme={colorScheme === 'dark' ? 'vs-dark' : 'vs'}
      options={{
        readOnly: !editable,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        lineNumbers: 'on',
        wordWrap: 'on',
        contextmenu: false,
        renderLineHighlight: 'line',
        scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
      }}
    />
  )

  return (
    <ConsoleSurface>
      <FilePicker onSelect={(file) => setSearchParams({ file })} />
      <ResizablePanelLayout
        hidePanel
        flushBody
        leftDrawer={
          <FileTreeRail
            selectedPath={selectedPath}
            onSelect={(file) => setSearchParams({ file })}
          />
        }
        leftDrawerWidth={264}
        leftDrawerLabel={m.code_files_label()}
        header={
          <ListPageHeader
            title={m.nav_code()}
            item={selectedPath ? <PathCrumbs path={selectedPath} /> : undefined}
            onTitle={selectedPath ? () => setSearchParams({}) : undefined}
            filters={
              selectedPath && editable ? (
                <Group gap="sm" wrap="nowrap">
                  {save.isError && (
                    <Text size="xs" c="red">
                      {m.code_save_failed()}
                    </Text>
                  )}
                  <Button
                    size="xs"
                    data-testid="code-save"
                    leftSection={<Save size={14} />}
                    disabled={!dirty}
                    loading={save.isPending}
                    onClick={() => saveRef.current()}
                  >
                    {dirty ? m.code_save() : m.code_saved()}
                  </Button>
                </Group>
              ) : undefined
            }
          />
        }
      >
        <Box
          style={{
            height: '100%',
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {editorBody}
        </Box>
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
