import { Center, Loader } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import styles from '../../studio/StudioAppsPage.module.css'

const PageLoader = () => <Center p="md"><Loader size="sm" /></Center>

export type GitCommitEntry = {
  sha: string
  shortSha: string
  subject: string
  author: string
  date: string
}

export function formatCommitDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function CommitHistory({
  commits,
  loading,
  error,
}: {
  commits: GitCommitEntry[]
  loading: boolean
  error: string | null
}) {
  if (loading) return <PageLoader />
  if (error) return <div className={styles.commitState}>{asI18n(error)}</div>
  if (commits.length === 0) return <div className={styles.commitState}>{m.studio_history_empty()}</div>

  return (
    <div className={styles.commitList}>
      {commits.map((commit) => (
        <div key={commit.sha} className={styles.commitItem}>
          <div className={styles.commitSubject}>{commit.subject ? asI18n(commit.subject) : m.studio_history_untitled()}</div>
          <div className={styles.commitMeta}>
            <span>{asI18n(commit.shortSha)}</span>
            <span>{asI18n(formatCommitDate(commit.date))}</span>
            <span>{asI18n(commit.author)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
