import { Menu } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import type { DockMenu, DockTile, FlyoutRow } from './model'
import classes from './NavDock.module.css'

/**
 * A tile's menu.
 *
 * The shape is the point: a rail could only show a label, so its submenus were a
 * worse copy of the rail with an extra click. A row here carries the label plus
 * the state that decides which label you actually want — a status dot, an
 * environment chip, a count — all fed from the same data the page it opens
 * would show.
 *
 * Everything is real: a row shows a number only where the console genuinely
 * knows it. An invented count in a production console is worse than no count.
 */
export function DockFlyout({
  menu,
  isActiveRow,
  onClose,
}: {
  menu: DockMenu
  isActiveRow: (t: Pick<DockTile, 'match'>) => boolean
  onClose: () => void
}) {
  return (
    <Menu.Dropdown aria-label={menu.label}>
      {menu.head && (
        <div className={classes.flyoutHead}>
          <span className={classes.flyoutHeadMark}>{menu.head.mark}</span>
          <span className={classes.flyoutHeadText}>
            <span className={classes.flyoutHeadTitle}>{menu.head.title}</span>
            <span className={classes.flyoutHeadSub}>{menu.head.sub}</span>
          </span>
          {menu.head.chip && (
            <span className={classes.chip}>{menu.head.chip}</span>
          )}
        </div>
      )}
      {menu.sections.map((section, i) => (
        <div key={section.key}>
          {section.title ? (
            <div className={classes.flyoutTitle}>{section.title}</div>
          ) : i > 0 ? (
            <hr className={classes.flyoutSep} />
          ) : null}
          {section.rows.length === 0 ? (
            <div className={classes.fiEmpty}>
              {section.empty ?? m.nav_dock_empty()}
            </div>
          ) : (
            section.rows.map((row) => (
              <Row
                key={row.key}
                row={row}
                active={isActiveRow(row)}
                onClose={onClose}
              />
            ))
          )}
        </div>
      ))}
    </Menu.Dropdown>
  )
}

function Row({
  row,
  active,
  onClose,
}: {
  row: FlyoutRow
  active: boolean
  onClose: () => void
}) {
  const { Icon } = row
  return (
    <Menu.Item
      component="button"
      className={classes.flyoutItem}
      data-active={String(active)}
      data-danger={row.danger ? 'true' : undefined}
      // The meta and the badge are the reason the row is worth reading at all,
      // so they reach the accessibility tree rather than staying decorative.
      aria-label={[
        row.label,
        row.env && `${row.env} environment`,
        row.meta,
        row.badge?.text,
      ]
        .filter(Boolean)
        .join(', ')}
      onClick={() => {
        row.onSelect()
        onClose()
      }}
    >
      <Icon />
      <span className={classes.fiMain}>
        <span className={classes.fiLabel}>
          {row.status ? (
            <i className={classes.fiDot} data-status={row.status} />
          ) : null}
          {row.label}
          {row.env ? (
            <i className={classes.envChip} data-env={row.env}>
              {row.env === 'prod'
                ? 'PROD'
                : row.env === 'staging'
                  ? 'STAGING'
                  : 'PREVIEW'}
            </i>
          ) : null}
        </span>
        {row.meta ? (
          <span className={classes.fiMeta} data-tone={row.tone}>
            {row.meta}
          </span>
        ) : null}
      </span>
      {row.badge || row.hint ? (
        <span className={classes.fiEnd}>
          {row.badge ? (
            <span className={classes.fiBadge} data-tone={row.badge.tone}>
              {row.badge.text}
            </span>
          ) : null}
          {row.hint ? <span className={classes.fiHint}>{row.hint}</span> : null}
        </span>
      ) : null}
    </Menu.Item>
  )
}
