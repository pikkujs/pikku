import React from 'react'
import { PikkuBadge } from '../../ui/PikkuBadge'
import { usePikkuMeta } from '../../../context/PikkuMetaContext'
import { usePanelContext } from '../../../context/PanelContext'
import classes from '../../ui/console.module.css'

interface LinkedBadgeProps {
  item: any
  kind: 'middleware' | 'permission'
}

export const LinkedBadge: React.FunctionComponent<LinkedBadgeProps> = ({
  item,
  kind,
}) => {
  const { meta } = usePikkuMeta()
  const { navigateInPanel } = usePanelContext()
  const metaKey =
    kind === 'middleware' ? 'middlewareGroupsMeta' : 'permissionsGroupsMeta'
  const isWire = item.type === 'wire'

  if (!isWire) {
    const groupKey = item.tag || item.route
    const label = item.type === 'tag' ? `tag: ${item.tag}` : item.route
    return (
      <PikkuBadge
        type="dynamic"
        badge={kind}
        value={label}
        variant="outline"
        className={classes.clickableText}
        onClick={() =>
          navigateInPanel(kind, `${item.type}:${groupKey}`, label, {
            _groupType: item.type,
            _groupKey: groupKey,
          })
        }
      />
    )
  }

  const label = item.name || kind
  const defData = meta[metaKey]?.definitions?.[item.name]

  return (
    <PikkuBadge
      type="dynamic"
      badge={kind}
      value={label}
      className={classes.clickableText}
      onClick={() =>
        navigateInPanel(kind, item.name, label, { ...defData, _id: item.name })
      }
    />
  )
}
