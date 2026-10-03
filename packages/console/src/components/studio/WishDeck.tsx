import React from 'react'
import { ActionIcon, Group, Loader, Stack, Text } from '@pikku/mantine/core'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { SectionCard } from '../ui/SectionCard'
import { CardRow } from '../ui/CardRow'
import {
  useReactToWish,
  useStudioWishes,
  type StudioWish,
} from '../../hooks/useStudio'

const WishRow: React.FC<{ wish: StudioWish; index: number }> = ({
  wish,
  index,
}) => {
  const react = useReactToWish()
  const toggle = (reaction: 'liked' | 'disliked') =>
    react.mutate({
      title: wish.title,
      reaction: wish.reaction === reaction ? null : reaction,
    })
  return (
    <CardRow
      testId={`wish-${index}`}
      title={asI18n(wish.title)}
      meta={asI18n(wish.line)}
      trailing={
        <Group gap={4} wrap="nowrap">
          <ActionIcon
            variant={wish.reaction === 'liked' ? 'filled' : 'subtle'}
            color={wish.reaction === 'liked' ? 'green' : 'gray'}
            aria-label={m.wishes_like()}
            aria-pressed={wish.reaction === 'liked'}
            onClick={() => toggle('liked')}
          >
            <ThumbsUp size={14} />
          </ActionIcon>
          <ActionIcon
            variant={wish.reaction === 'disliked' ? 'filled' : 'subtle'}
            color={wish.reaction === 'disliked' ? 'red' : 'gray'}
            aria-label={m.wishes_dislike()}
            aria-pressed={wish.reaction === 'disliked'}
            onClick={() => toggle('disliked')}
          >
            <ThumbsDown size={14} />
          </ActionIcon>
        </Group>
      }
    />
  )
}

export const WishDeck: React.FC = () => {
  const { data } = useStudioWishes()
  if (!data || data.status === 'unavailable') {
    if (data?.reason === 'no-model' || data?.reason === 'subscription') {
      return (
        <SectionCard
          testId="wishes"
          title={m.wishes_title()}
          blurb={data.reason === 'subscription' ? m.wishes_subscription() : m.wishes_no_model()}
        />
      )
    }
    return null
  }
  const liked = data.wishes.filter((w) => w.reaction === 'liked').length
  return (
    <SectionCard
      testId="wishes"
      title={m.wishes_title()}
      subtitle={liked ? m.wishes_liked({ count: liked }) : undefined}
      blurb={m.wishes_blurb()}
    >
      {data.status === 'generating' ? (
        <Group gap="sm" mt="md">
          <Loader size="xs" />
          <Text size="sm" c="dimmed">
            {m.wishes_generating()}
          </Text>
        </Group>
      ) : (
        <Stack gap="xs" mt="md">
          {data.wishes.map((wish, index) => (
            <WishRow key={wish.title} wish={wish} index={index} />
          ))}
        </Stack>
      )}
    </SectionCard>
  )
}
