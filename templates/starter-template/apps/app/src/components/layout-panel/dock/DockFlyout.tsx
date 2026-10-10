import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { DockMenu, DockTile, FlyoutRow } from './model.js'
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
  emptyLabel,
}: {
  menu: DockMenu
  isActiveRow: (t: Pick<DockTile, 'match'>) => boolean
  onClose: () => void
  /** Shown for a section that has no rows. */
  emptyLabel: string
}) {
  return (
    <>
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
            <div className={classes.fiEmpty}>{section.empty ?? emptyLabel}</div>
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
    </>
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

  /* A row that opens a submenu, the way Language and Appearance do. Radix owns
     the open/close, the hover intent and the keyboard, so this is the same Row
     one level down. */
  if (row.rows?.length) {
    return (
      <DropdownMenu.Sub>
        <DropdownMenu.SubTrigger
          className={classes.flyoutItem}
          data-active={String(active)}
        >
          <Body row={row} />
        </DropdownMenu.SubTrigger>
        <DropdownMenu.Portal>
          <DropdownMenu.SubContent
            className={classes.flyout}
            sideOffset={14}
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
          </DropdownMenu.SubContent>
        </DropdownMenu.Portal>
      </DropdownMenu.Sub>
    )
  }

  /* A range, not a set of alternatives. A div rather than a menu item because a
     menu item swallows the pointer and the arrow keys the slider needs — and
     closing the menu on release would put the thing you are sizing out of sight
     exactly when you want to see it. */
  if (row.slider) {
    const { value, min, max, step, format, onChange } = row.slider
    return (
      <div
        className={classes.fiSlider}
        onKeyDown={(e) => e.stopPropagation()}
        data-testid={`flyout-slider-${row.key}`}
      >
        <div className={classes.fiSliderHead}>
          <Body
            row={{ ...row, hint: format ? format(value) : String(value) }}
          />
        </div>
        <input
          type="range"
          className={classes.fiRange}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={row.label}
        />
      </div>
    )
  }

  /* A setting, not a destination. Selectable items carry the
     `menuitemradio`/`menuitemcheckbox` role and the `aria-checked` a screen
     reader reads out — none of which a plain item with a check glyph drawn into
     it has. They also stay open on click, which is what you want while trying
     appearances on. */
  if (row.checked !== undefined) {
    const tick = (
      <DropdownMenu.ItemIndicator forceMount className={classes.fiTick}>
        {row.checked ? <TickIcon /> : null}
      </DropdownMenu.ItemIndicator>
    )
    const keepOpen = (e: Event) => {
      e.preventDefault()
      row.onSelect?.()
    }
    return row.exclusive ? (
      <DropdownMenu.RadioGroup value={row.checked ? row.key : ''}>
        <DropdownMenu.RadioItem
          value={row.key}
          onSelect={keepOpen}
          className={classes.flyoutItem}
        >
          {tick}
          <Body row={row} />
        </DropdownMenu.RadioItem>
      </DropdownMenu.RadioGroup>
    ) : (
      <DropdownMenu.CheckboxItem
        checked={row.checked}
        onSelect={keepOpen}
        className={classes.flyoutItem}
      >
        {tick}
        <Body row={row} />
      </DropdownMenu.CheckboxItem>
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
    <DropdownMenu.Item
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
      onSelect={() => {
        row.onSelect?.()
        onClose()
      }}
    >
      <Body row={row} />
    </DropdownMenu.Item>
  )
}

function TickIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      aria-hidden
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
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
