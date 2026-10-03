import { useState } from 'react'
import { Check, Palette, Plus } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ColorSwatch, Text, TextInput, UnstyledButton } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { callSandboxControlRpc } from './sandboxControl'
import type { ThemesResponse } from './themeModel'
import { useBuilderSandbox } from './context'

type ThemeSwitcherMenuProps = {
  onThemeChanged: () => void
}

// Theme ids are kebab-case starting with a letter (orchestrator THEME_ID_RE).
const slugifyThemeId = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 39)
  if (!slug) return ''
  return /^[a-z]/.test(slug) ? slug : `t-${slug}`.slice(0, 39)
}

// Dropdown behind the Theme lens chevron: switch the active theme or create a
// new one (a clone of the active spec). Mirrors the chat-sessions dropdown.
export const ThemeSwitcherMenu: React.FC<ThemeSwitcherMenuProps> = ({ onThemeChanged }) => {
  const { runtimeBaseUrl, builderToken } = useBuilderSandbox()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const enabled = !!runtimeBaseUrl && !!builderToken
  const themesQuery = useQuery({
    queryKey: ['sandbox-themes', runtimeBaseUrl],
    enabled,
    queryFn: () =>
      callSandboxControlRpc<ThemesResponse>(runtimeBaseUrl!, 'getSandboxThemes', {}, builderToken!),
  })

  const activateMutation = useMutation({
    mutationFn: (id: string) =>
      callSandboxControlRpc(runtimeBaseUrl!, 'setActiveTheme', { id }, builderToken!),
    onSuccess: () => {
      void themesQuery.refetch()
      onThemeChanged()
    },
  })

  const createMutation = useMutation({
    mutationFn: (input: { id: string; name: string }) =>
      callSandboxControlRpc(runtimeBaseUrl!, 'createTheme', input, builderToken!),
    onSuccess: () => {
      setCreating(false)
      setNewName('')
      void themesQuery.refetch()
      onThemeChanged()
    },
  })

  const submitCreate = () => {
    const name = newName.trim()
    const id = slugifyThemeId(name)
    if (!name || !id || createMutation.isPending) return
    createMutation.mutate({ id, name })
  }

  const themes = themesQuery.data?.themes ?? []
  const activeId = themesQuery.data?.activeId
  const mutationError = createMutation.error ?? activateMutation.error

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 240 }}>
      <Text
        size="xs"
        fw={600}
        tt="uppercase"
        px={6}
        py={4}
        style={{ letterSpacing: '0.08em', color: 'var(--app-text-faint)' }}
      >
        {m.design_panel_theme_menu_heading()}
      </Text>
      {themesQuery.isLoading ? (
        <Text size="xs" c="dimmed" px={6} py={4}>
          {m.design_panel_theme_menu_loading()}
        </Text>
      ) : themes.length === 0 ? (
        <Text size="xs" c="dimmed" px={6} py={4}>
          {m.design_panel_theme_menu_empty()}
        </Text>
      ) : (
        themes.map((theme) => {
          const isActive = theme.id === activeId
          const isBusy = activateMutation.isPending && activateMutation.variables === theme.id
          return (
            <UnstyledButton
              key={theme.id}
              onClick={() => {
                if (!isActive && !activateMutation.isPending) activateMutation.mutate(theme.id)
              }}
              data-testid={`theme-menu-item-${theme.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 8px',
                borderRadius: 8,
                background: isActive ? 'var(--app-panel-bg-strong)' : undefined,
                opacity: isBusy ? 0.6 : 1,
              }}
            >
              {theme.bases?.primary ? (
                <ColorSwatch color={theme.bases.primary} size={14} radius={5} />
              ) : (
                <Palette size={14} color="var(--app-text-faint)" />
              )}
              <span style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" truncate style={{ color: 'var(--app-text)' }}>
                  {asI18n(theme.name)}
                </Text>
              </span>
              {isActive ? <Check size={13} color="var(--app-accent)" /> : null}
            </UnstyledButton>
          )
        })
      )}
      <div style={{ height: 1, background: 'var(--app-border)', margin: '4px 0' }} />
      {creating ? (
        <TextInput
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={m.design_panel_theme_menu_name_placeholder()}
          autoFocus
          size="xs"
          radius="md"
          disabled={createMutation.isPending}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submitCreate()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setCreating(false)
              setNewName('')
            }
          }}
        />
      ) : (
        <UnstyledButton
          onClick={() => setCreating(true)}
          data-testid="theme-menu-new"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '7px 8px',
            borderRadius: 8,
            color: 'var(--app-accent)',
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          <Plus size={14} />
          <span>{m.design_panel_theme_menu_new()}</span>
        </UnstyledButton>
      )}
      {mutationError ? (
        <Text size="xs" c="red" px={6} py={2}>
          {asI18n(String(mutationError))}
        </Text>
      ) : null}
    </div>
  )
}
