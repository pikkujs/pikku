import { Button, type ButtonProps, Group } from '@pikku/mantine/core'
import type { I18nNode } from '@pikku/react'
import { m } from '@/i18n/messages'
import { DiscordIcon } from './DiscordIcon'
import { FacebookIcon } from './FacebookIcon'
import { GithubIcon } from './GithubIcon'
import { GoogleIcon } from './GoogleIcon'
import { TwitterIcon } from './TwitterIcon'

export function GoogleButton(
  props: ButtonProps & {
    children?: I18nNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
  },
) {
  return <Button leftSection={<GoogleIcon />} variant="default" {...props} />
}

export function FacebookButton(
  props: ButtonProps & {
    children?: I18nNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
  },
) {
  return (
    <Button
      leftSection={<FacebookIcon />}
      styles={{ root: { backgroundColor: '#4267b2', color: '#fff' } }}
      {...props}
    />
  )
}

export function DiscordButton(
  props: ButtonProps & {
    children?: I18nNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
  },
) {
  return (
    <Button
      leftSection={<DiscordIcon />}
      styles={{ root: { backgroundColor: '#5865f2', color: '#fff' } }}
      {...props}
    />
  )
}

export function TwitterButton(
  props: ButtonProps & { children?: I18nNode; href?: string; target?: string },
) {
  return <Button component="a" leftSection={<TwitterIcon />} variant="default" {...props} />
}

export function GithubButton(
  props: ButtonProps & {
    children?: I18nNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
  },
) {
  return (
    <Button
      leftSection={<GithubIcon />}
      styles={{
        root: {
          backgroundColor: 'var(--mantine-color-dark-9)',
          color: 'var(--mantine-color-white)',
        },
      }}
      {...props}
    />
  )
}

export function SocialButtons() {
  return (
    <Group justify="center" p="md">
      <GoogleButton>{m.socialbuttons__google()}</GoogleButton>
      <TwitterButton href="https://twitter.com/mantinedev" target="_blank">
        {m.socialbuttons__twitter()}
      </TwitterButton>
      <FacebookButton>{m.socialbuttons__facebook()}</FacebookButton>
      <GithubButton>{m.socialbuttons__github()}</GithubButton>
      <DiscordButton>{m.socialbuttons__discord()}</DiscordButton>
    </Group>
  )
}
