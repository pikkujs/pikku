export type AskChangeQuestionInput = {
  changeId: string
  projectId?: string | undefined
  question: string
  authorName: string
  attachments?:
    | {
        key: string
        label: string
        kind: 'option' | 'evidence'
      }[]
    | undefined
  option?: string[] | undefined
}
export type AskChangeQuestionOutput = {
  message: {
    messageId: string
    changeId: string
    authorKind: 'agent' | 'user'
    authorName: string | null
    body: string
    attachments: {
      key: string
      label: string
      kind: 'option' | 'evidence'
    }[]
    chosenOption: string | null
    createdAt: Date
  }
}
export type AttachChangeShotInput = {
  changeId: string
  projectId?: string | undefined
  label: string
  kind?: ('option' | 'evidence') | undefined
  contentType?: ('image/png' | 'image/jpeg' | 'image/webp') | undefined
  imageBase64: string
  authorName: string
}
export type AttachChangeShotOutput = {
  message: {
    messageId: string
    changeId: string
    authorKind: 'agent' | 'user'
    authorName: string | null
    body: string
    attachments: {
      key: string
      label: string
      kind: 'option' | 'evidence'
    }[]
    chosenOption: string | null
    createdAt: Date
  }
  key: string
}
export type ClaimChangesInput = {
  projectId: string
  groupId?: string | undefined
  changeIds?: string[] | undefined
  title?: string | undefined
  claimedBy: string
  leaseMinutes?: number | undefined
}
export type ClaimChangesOutput = {
  group: {
    groupId: string
    projectId: string
    title: string
    claimedBy: string | null
    claimExpiresAt: Date | null
    createdAt: Date
  }
  changes: {
    changeId: string
    shortId: string
    projectId: string
    stageId: string
    groupId: string | null
    title: string
    body: string | null
    status:
      'open' | 'claimed' | 'needs_answer' | 'in_progress' | 'done' | 'dismissed'
    source: 'panel' | 'console' | 'system'
    requestedBranch: string | null
    route: string | null
    gitSha: string | null
    deploymentId: string | null
    locale: string | null
    viewport: {
      width: number
      height: number
    } | null
    capture: {
      stroke?:
        | {
            x: number
            y: number
          }[]
        | undefined
      bounds?:
        | ({
            x: number
            y: number
            width: number
            height: number
          } | null)
        | undefined
      elements?:
        | {
            testId?: (string | null) | undefined
            sourceAnchor?: (string | null) | undefined
            cssPath?: (string | null) | undefined
            text?: (string | null) | undefined
            rect?:
              | ({
                  x: number
                  y: number
                  width: number
                  height: number
                } | null)
              | undefined
          }[]
        | undefined
    } | null
    screenshotKey: string | null
    branch: string | null
    headCommit: string | null
    resolvedAt: Date | null
    acknowledgedAt: Date | null
    resolvedBySandboxId: string | null
    resolvedBySandboxSlug: string | null
    createdAt: Date
    held: boolean
    heldUntil: Date | null
  }[]
}
export type CompleteChangeInput = {
  changeId: string
  projectId?: string | undefined
  branch?: string | undefined
  headCommit?: string | undefined
  note?: string | undefined
  authorName?: string | undefined
}
export type CompleteChangeOutput = {
  change: {
    changeId: string
    shortId: string
    projectId: string
    stageId: string
    groupId: string | null
    title: string
    body: string | null
    status:
      'open' | 'claimed' | 'needs_answer' | 'in_progress' | 'done' | 'dismissed'
    source: 'panel' | 'console' | 'system'
    requestedBranch: string | null
    route: string | null
    gitSha: string | null
    deploymentId: string | null
    locale: string | null
    viewport: {
      width: number
      height: number
    } | null
    capture: {
      stroke?:
        | {
            x: number
            y: number
          }[]
        | undefined
      bounds?:
        | ({
            x: number
            y: number
            width: number
            height: number
          } | null)
        | undefined
      elements?:
        | {
            testId?: (string | null) | undefined
            sourceAnchor?: (string | null) | undefined
            cssPath?: (string | null) | undefined
            text?: (string | null) | undefined
            rect?:
              | ({
                  x: number
                  y: number
                  width: number
                  height: number
                } | null)
              | undefined
          }[]
        | undefined
    } | null
    screenshotKey: string | null
    branch: string | null
    headCommit: string | null
    resolvedAt: Date | null
    acknowledgedAt: Date | null
    resolvedBySandboxId: string | null
    resolvedBySandboxSlug: string | null
    createdAt: Date
    held: boolean
    heldUntil: Date | null
  }
}
export type CreateChangeInput = {
  stageId: string
  title: string
  body?: string | undefined
  requestedBranch?: string | undefined
  route?: string | undefined
  deploymentId?: string | undefined
  gitSha?: string | undefined
  locale?: string | undefined
  viewport?:
    | {
        width: number
        height: number
      }
    | undefined
  capture?:
    | {
        stroke?:
          | {
              x: number
              y: number
            }[]
          | undefined
        bounds?:
          | ({
              x: number
              y: number
              width: number
              height: number
            } | null)
          | undefined
        elements?:
          | {
              testId?: (string | null) | undefined
              sourceAnchor?: (string | null) | undefined
              cssPath?: (string | null) | undefined
              text?: (string | null) | undefined
              rect?:
                | ({
                    x: number
                    y: number
                    width: number
                    height: number
                  } | null)
                | undefined
            }[]
          | undefined
      }
    | undefined
  screenshotKey?: string | undefined
  consoleErrors?: string[] | undefined
}
export type CreateChangeOutput = {
  change: {
    changeId: string
    shortId: string
    projectId: string
    stageId: string
    groupId: string | null
    title: string
    body: string | null
    status:
      'open' | 'claimed' | 'needs_answer' | 'in_progress' | 'done' | 'dismissed'
    source: 'panel' | 'console' | 'system'
    requestedBranch: string | null
    route: string | null
    gitSha: string | null
    deploymentId: string | null
    locale: string | null
    viewport: {
      width: number
      height: number
    } | null
    capture: {
      stroke?:
        | {
            x: number
            y: number
          }[]
        | undefined
      bounds?:
        | ({
            x: number
            y: number
            width: number
            height: number
          } | null)
        | undefined
      elements?:
        | {
            testId?: (string | null) | undefined
            sourceAnchor?: (string | null) | undefined
            cssPath?: (string | null) | undefined
            text?: (string | null) | undefined
            rect?:
              | ({
                  x: number
                  y: number
                  width: number
                  height: number
                } | null)
              | undefined
          }[]
        | undefined
    } | null
    screenshotKey: string | null
    branch: string | null
    headCommit: string | null
    resolvedAt: Date | null
    acknowledgedAt: Date | null
    resolvedBySandboxId: string | null
    resolvedBySandboxSlug: string | null
    createdAt: Date
    held: boolean
    heldUntil: Date | null
  }
}
export type GetChangeInput = {
  changeId: string
  projectId?: string | undefined
}
export type GetChangeOutput = {
  change: {
    changeId: string
    shortId: string
    projectId: string
    stageId: string
    groupId: string | null
    title: string
    body: string | null
    status:
      'open' | 'claimed' | 'needs_answer' | 'in_progress' | 'done' | 'dismissed'
    source: 'panel' | 'console' | 'system'
    requestedBranch: string | null
    route: string | null
    gitSha: string | null
    deploymentId: string | null
    locale: string | null
    viewport: {
      width: number
      height: number
    } | null
    capture: {
      stroke?:
        | {
            x: number
            y: number
          }[]
        | undefined
      bounds?:
        | ({
            x: number
            y: number
            width: number
            height: number
          } | null)
        | undefined
      elements?:
        | {
            testId?: (string | null) | undefined
            sourceAnchor?: (string | null) | undefined
            cssPath?: (string | null) | undefined
            text?: (string | null) | undefined
            rect?:
              | ({
                  x: number
                  y: number
                  width: number
                  height: number
                } | null)
              | undefined
          }[]
        | undefined
    } | null
    screenshotKey: string | null
    branch: string | null
    headCommit: string | null
    resolvedAt: Date | null
    acknowledgedAt: Date | null
    resolvedBySandboxId: string | null
    resolvedBySandboxSlug: string | null
    createdAt: Date
    held: boolean
    heldUntil: Date | null
    screenshotUrl: string | null
    live: ('live' | 'deploying' | 'waiting') | null
  }
  thread: {
    messageId: string
    changeId: string
    authorKind: 'agent' | 'user'
    authorName: string | null
    body: string
    attachments: {
      key: string
      label: string
      kind: 'option' | 'evidence'
      url: string | null
    }[]
    chosenOption: string | null
    createdAt: Date
  }[]
  stageUrl: string | null
}
export type ListChangesInput = {
  projectId: string
  stageId?: string | undefined
  route?: string | undefined
  status?:
    | (
        | 'open'
        | 'claimed'
        | 'needs_answer'
        | 'in_progress'
        | 'done'
        | 'dismissed'
      )[]
    | undefined
  groupId?: string | undefined
  pickupOnly?: boolean | undefined
  includeDone?: boolean | undefined
  limit?: number | undefined
}
export type ListChangesOutput = {
  changes: {
    changeId: string
    shortId: string
    projectId: string
    stageId: string
    groupId: string | null
    title: string
    body: string | null
    status:
      'open' | 'claimed' | 'needs_answer' | 'in_progress' | 'done' | 'dismissed'
    source: 'panel' | 'console' | 'system'
    requestedBranch: string | null
    route: string | null
    gitSha: string | null
    deploymentId: string | null
    locale: string | null
    viewport: {
      width: number
      height: number
    } | null
    capture: {
      stroke?:
        | {
            x: number
            y: number
          }[]
        | undefined
      bounds?:
        | ({
            x: number
            y: number
            width: number
            height: number
          } | null)
        | undefined
      elements?:
        | {
            testId?: (string | null) | undefined
            sourceAnchor?: (string | null) | undefined
            cssPath?: (string | null) | undefined
            text?: (string | null) | undefined
            rect?:
              | ({
                  x: number
                  y: number
                  width: number
                  height: number
                } | null)
              | undefined
          }[]
        | undefined
    } | null
    screenshotKey: string | null
    branch: string | null
    headCommit: string | null
    resolvedAt: Date | null
    acknowledgedAt: Date | null
    resolvedBySandboxId: string | null
    resolvedBySandboxSlug: string | null
    createdAt: Date
    held: boolean
    heldUntil: Date | null
    screenshotUrl: string | null
  }[]
  groups: {
    groupId: string
    projectId: string
    title: string
    claimedBy: string | null
    claimExpiresAt: Date | null
    createdAt: Date
  }[]
}
export type ReplyToChangeInput = {
  changeId: string
  projectId?: string | undefined
  body: string
  authorName: string
  imageBase64?: string | undefined
  contentType?: ('image/png' | 'image/jpeg' | 'image/webp') | undefined
  imageLabel?: string | undefined
}
export type ReplyToChangeOutput = {
  message: {
    messageId: string
    changeId: string
    authorKind: 'agent' | 'user'
    authorName: string | null
    body: string
    attachments: {
      key: string
      label: string
      kind: 'option' | 'evidence'
    }[]
    chosenOption: string | null
    createdAt: Date
  }
}

export type ChangesRpcMap = {
  askChangeQuestion: {
    input: AskChangeQuestionInput
    output: AskChangeQuestionOutput
  }
  attachChangeShot: {
    input: AttachChangeShotInput
    output: AttachChangeShotOutput
  }
  claimChanges: { input: ClaimChangesInput; output: ClaimChangesOutput }
  completeChange: { input: CompleteChangeInput; output: CompleteChangeOutput }
  createChange: { input: CreateChangeInput; output: CreateChangeOutput }
  getChange: { input: GetChangeInput; output: GetChangeOutput }
  listChanges: { input: ListChangesInput; output: ListChangesOutput }
  replyToChange: { input: ReplyToChangeInput; output: ReplyToChangeOutput }
}

export type ChangesRPC = {
  invoke<Name extends keyof ChangesRpcMap>(
    name: Name,
    data: ChangesRpcMap[Name]['input']
  ): Promise<ChangesRpcMap[Name]['output']>
}

export interface NextResult {
  outcome: 'ready' | 'timeout'
  changes: (
    ListChangesOutput['changes'][number] | ClaimChangesOutput['changes'][number]
  )[]
  answered: ListChangesOutput['changes'][number][]
  groups: ListChangesOutput['groups'][number][]
  claimed: ClaimChangesOutput | null
}
