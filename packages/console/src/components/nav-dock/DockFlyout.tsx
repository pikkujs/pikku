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
  /* A menu holding a submenu cannot also be the thing that scrolls: `overflow`
     of any kind makes it a clipping boundary, and floating-ui then shifts the
     child back inside the parent it is supposed to stand beside. A settings menu
     is short by construction, so it gives up the cap rather than the submenu. */
  const nested = menu.sections.some((s) => s.rows.some((r) => r.rows?.length))

  return (
    <Menu.Dropdown aria-label={menu.label} data-nested={nested || undefined}>
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
                isActiveRow={isActiveRow}
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
  isActiveRow,
  onClose,
}: {
  row: FlyoutRow
  isActiveRow: (t: Pick<DockTile, 'match'>) => boolean
  onClose: () => void
}) {
  const active = isActiveRow(row)

  /* A row that opens a submenu, the way Language and Appearance do. Mantine owns
     the open/close, the hover intent and the keyboard, so this is the same Row
     one level down. Its defaults are kept, `withinPortal: false` included: the
     parent's click-outside only counts its own target and dropdown nodes, so a
     portalled child would be "outside" and every pick would shut the whole menu.
     What a submenu needs instead is a parent that does not clip it — see
     `data-nested` on the dropdown. */
  if (row.rows?.length) {
    return (
      // 6 to clear the parent's own padding, which the row it hangs off is
      // inset by, and 8 for the seam every other pair of surfaces here uses.
      <Menu.Sub offset={14}>
        <Menu.Sub.Target>
          <Menu.Sub.Item
            className={classes.flyoutItem}
            data-active={String(active)}
          >
            <Body row={row} />
          </Menu.Sub.Item>
        </Menu.Sub.Target>
        <Menu.Sub.Dropdown
          className={classes.flyout}
          aria-label={row.label}
          data-testid={`flyout-sub-${row.key}`}
        >
          {row.rows.map((child) => (
            <Row
              key={child.key}
              row={child}
              isActiveRow={isActiveRow}
              onClose={onClose}
            />
          ))}
        </Menu.Sub.Dropdown>
      </Menu.Sub>
    )
  }

  /* A setting, not a destination. Mantine's selectable items carry the tick, the
     `menuitemradio`/`menuitemcheckbox` role and the `aria-checked` a screen
     reader reads out — none of which a Menu.Item with a check glyph drawn into
     it has. They also stay open on click, which is what you want while trying
     appearances on. */
  if (row.checked !== undefined) {
    const Selectable = row.exclusive ? Menu.RadioItem : Menu.CheckboxItem
    return (
      <Selectable
        value={row.key}
        checked={row.checked}
        onChange={() => row.onSelect?.()}
        className={classes.flyoutItem}
        classNames={{ itemIndicator: classes.fiTick }}
      >
        <Body row={row} />
      </Selectable>
    )
  }

  /* A row with nothing to do is a step, not a control — the iOS install route is
     an instruction the browser gives us no way to perform. Rendering it as a
     button would make it look like the one thing it cannot be. */
  if (!row.onSelect) {
    return (
      <div className={classes.fiNote}>
        <Body row={row} />
      </div>
    )
  }

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
        row.onSelect?.()
        onClose()
      }}
    >
      <Body row={row} />
    </Menu.Item>
  )
}

function Body({ row }: { row: FlyoutRow }) {
  const { Icon } = row
  return (
    <>
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
    </>
  )
}
