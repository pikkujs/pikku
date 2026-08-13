import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Menu, Tooltip } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { useLocalStorage } from '@mantine/hooks'
import { Ellipsis } from 'lucide-react'
import { m } from '@/i18n/messages'
import { DockFlyout } from './DockFlyout'
import {
  isSep,
  type DockEntry,
  type DockTile,
  type IconComponent,
} from './model'
import classes from './NavDock.module.css'

/* The size band the row lives in. 34px is the floor, not 40: it clears WCAG
   2.5.8's 24×24 with room to spare even for the contextual zone's 0.92 tiles,
   and it holds the full row down past iPad portrait. At 40 the row condensed at
   900px — a laptop width where the whole point of the dock is that everything is
   still there. */
const TILE_MAX = 54
const TILE_MIN = 34

export interface NavDockProps {
  /** The tile that never moves, in position 0. Its menu is the one that answers
   *  "where am I, and what else is there". */
  identity?: DockTile
  /** Drawn inside the identity tile in place of a glyph — the product's mark. */
  brand?: ReactNode
  /** Positions 1..n, and the reason muscle memory is possible: an app that
   *  varies these per page throws away the only thing the dock is for. */
  pinned?: DockEntry[]
  /** The zone that varies with where you are. Condenses into one tile rather
   *  than shrinking past the point where a tile can be hit. */
  contextual?: DockEntry[]
  /** The end of the row: the scope's primary action, then search. */
  utility?: DockTile[]
  /** Appended after `utility` — an account menu, which owns its own trigger. */
  accountSlot?: ReactNode
  /**
   * Whether a tile or row is the page you are already on. The dock never reads
   * a `match` token itself, so an app matching on route ids and one matching on
   * path prefixes both work without the dock knowing which it is talking to.
   */
  isActive?: (t: Pick<DockTile, 'match'>) => boolean
  /** The glyph the condensed contextual zone collapses into. */
  condensedIcon?: IconComponent
}

/**
 * The console's navigation, as a dock.
 *
 * A fixed overlay pinned to the foot of the window that reserves no layout and
 * appears when the pointer reaches the card gutter already sitting there — so
 * navigation costs zero pixels until it is wanted, and the icons get to be big
 * enough that their POSITION is what you learn rather than their label.
 *
 * Three things make that work and are worth not undoing:
 *
 *  - The pinned zone is byte-identical in every scope. Positions 1..3 mean the
 *    same thing everywhere, which is the only reason muscle memory is possible.
 *  - There is no macOS magnification. Magnification moves a tile's neighbours
 *    out from under the cursor, which defeats the muscle memory this exists for.
 *  - Below the width where the full row fits, the tiles SHRINK; below the width
 *    where they would stop being hittable, the contextual zone condenses into
 *    one tile. It never clips and never wraps.
 *
 * This component is presentational: it draws whatever zones it is handed. The
 * console assembles its own from {@link ConsoleNavDock}; an app embedding the
 * console builds them from its own routes and data instead.
 */
export function NavDock({
  identity,
  brand,
  pinned = [],
  contextual = [],
  utility = [],
  accountSlot,
  isActive = () => false,
  condensedIcon = Ellipsis,
}: NavDockProps) {
  /* ---------------- reveal ---------------- */

  const [held, setHeld] = useLocalStorage({
    key: 'nav-dock-pinned',
    defaultValue: false,
  })
  const [hovering, setHovering] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Asymmetric on purpose: 110ms of intent stops a cursor merely crossing the
     foot of the window from throwing the dock up, while 280ms of grace on the
     way out covers the gap the pointer crosses between the trigger line and the
     capsule as it rises. An open menu holds it up regardless. */
  const raise = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    if (openTimer.current) clearTimeout(openTimer.current)
    openTimer.current = setTimeout(() => setHovering(true), 110)
  }, [])
  const drop = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current)
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setHovering(false), 280)
  }, [])
  useEffect(
    () => () => {
      if (openTimer.current) clearTimeout(openTimer.current)
      if (closeTimer.current) clearTimeout(closeTimer.current)
    },
    []
  )

  const open = held || hovering || menuOpenId !== null

  /* ---------------- fit ---------------- */

  const dockRef = useRef<HTMLDivElement>(null)
  const [condensed, setCondensed] = useState(false)
  const [overflow, setOverflow] = useState(false)

  /* Measured, not estimated: start at full size and correct against the dock's
     real scrollWidth until it fits. Estimating from tile/gap/separator counts
     was wrong by 51px, which is a clipped Account tile. */
  const fit = useCallback(() => {
    const el = dockRef.current
    if (!el) return
    // The capsule's max-width is border-box, so its usable interior is 2px less
    // than the budget — comparing against the outer number left 2px clipped at
    // exactly the width where the loop declared victory.
    const avail = window.innerWidth - 26
    let t = TILE_MAX
    applyTile(el, t)
    for (let i = 0; i < 5 && t > TILE_MIN; i++) {
      const need = el.scrollWidth
      if (need <= avail) break
      t = Math.max(TILE_MIN, Math.floor(t * (avail / need)))
      applyTile(el, t)
    }
    const over = el.scrollWidth > el.clientWidth + 1
    // Rather than shrinking tiles past the point where they can be hit, the
    // whole contextual zone collapses into one.
    if (over && contextual.length) setCondensed(true)
    setOverflow(over)
  }, [contextual.length])

  useLayoutEffect(() => {
    fit()
  }, [fit, contextual, pinned, utility, condensed])

  useEffect(() => {
    const onResize = () => {
      // Always try the full row again, or a window that grew stays condensed
      // forever.
      setCondensed(false)
      fit()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [fit])

  /* ---------------- entries ---------------- */

  const shownContextual: DockEntry[] = condensed
    ? [
        {
          id: 'sections',
          label: m.nav_dock_sections(),
          Icon: condensedIcon,
          isGroup: true,
          menu: {
            label: m.nav_dock_sections(),
            sections: [
              {
                key: 'leaves',
                rows: contextual
                  .filter(
                    (e): e is DockTile =>
                      !isSep(e) && !e.isGroup && !!e.onSelect
                  )
                  .map((t) => ({
                    key: t.id,
                    Icon: t.Icon!,
                    label: t.label,
                    match: t.match,
                    onSelect: t.onSelect!,
                  })),
              },
              ...contextual
                .filter((e): e is DockTile => !isSep(e) && !!e.isGroup)
                .map((g) => ({
                  key: g.id,
                  title: g.label,
                  rows: g.menu?.sections.flatMap((s) => s.rows) ?? [],
                })),
            ],
          },
        },
      ]
    : contextual

  /* ---------------- roving focus ---------------- */

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = dockRef.current
    if (!el) return
    const tiles = [
      ...el.querySelectorAll<HTMLButtonElement>('button[data-tile]'),
    ]
    const i = tiles.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    const move = (n: number) => {
      e.preventDefault()
      tiles[(n + tiles.length) % tiles.length].focus()
    }
    if (e.key === 'ArrowRight') move(i + 1)
    else if (e.key === 'ArrowLeft') move(i - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(tiles.length - 1)
  }

  const renderTile = (t: DockTile, zone: 'pinned' | 'ctx' | 'util' | 'id') => (
    <DockTileButton
      key={t.id}
      tile={t}
      zone={zone}
      mark={brand}
      active={isActive(t)}
      menuOpen={menuOpenId === t.id}
      onMenuChange={(v) => setMenuOpenId(v ? t.id : null)}
      isActiveRow={isActive}
    />
  )

  const renderZone = (
    entries: DockEntry[],
    zone: 'pinned' | 'ctx' | 'util'
  ) => (
    <div className={classes.dockZone} data-zone={zone}>
      {entries.map((e) =>
        isSep(e) ? <Sep key={e.key} /> : renderTile(e, zone)
      )}
    </div>
  )

  return (
    <div
      className={classes.dockStrip}
      data-open={String(open)}
      data-pinned={String(held)}
      data-testid="nav-dock"
    >
      <button
        type="button"
        className={classes.dockTrigger}
        aria-label={held ? m.nav_dock_unpin() : m.nav_dock_show()}
        aria-expanded={open}
        aria-controls="nav-dock-row"
        data-testid="nav-dock-trigger"
        onClick={() => setHeld(!held)}
        onPointerEnter={raise}
        onPointerLeave={drop}
      >
        <span className={classes.dockHint} />
      </button>
      <div
        id="nav-dock-row"
        ref={dockRef}
        role="toolbar"
        aria-orientation="horizontal"
        aria-label={m.common_nav()}
        className={classes.dock}
        data-overflow={String(overflow)}
        /* A dock at opacity 0 is still focusable and still read aloud. `inert`
           takes it out of both, so Tab goes trigger → tiles and never into
           thin air. */
        inert={!open}
        onPointerEnter={raise}
        onPointerLeave={drop}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (closeTimer.current) clearTimeout(closeTimer.current)
          setHovering(true)
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) drop()
        }}
        /* The tile size is written straight onto this element by `applyTile`
           during the fit measurement, so this element must NOT also take a
           `style` prop — React would rewrite the attribute on every render and
           wipe the measured custom properties. */
      >
        {identity && (
          <>
            {renderTile(identity, 'id')}
            <Sep />
          </>
        )}
        {pinned.length > 0 && renderZone(pinned, 'pinned')}
        {shownContextual.length > 0 && (
          <>
            <Sep />
            {renderZone(shownContextual, 'ctx')}
          </>
        )}
        {(utility.length > 0 || accountSlot) && (
          <>
            <Sep />
            <div className={classes.dockZone} data-zone="util">
              {utility.map((t) => renderTile(t, 'util'))}
              {accountSlot}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Sep() {
  return (
    <div
      className={classes.dockSep}
      role="separator"
      aria-orientation="vertical"
    />
  )
}

/**
 * One tile. Click, right-click and long-press all reach the same menu, because a
 * dock icon whose submenu is only on right-click is a submenu nobody finds — the
 * failure the rail's hover-only flyouts had.
 */
function DockTileButton({
  tile,
  zone,
  mark,
  active,
  menuOpen,
  onMenuChange,
  isActiveRow,
}: {
  tile: DockTile
  zone: 'pinned' | 'ctx' | 'util' | 'id'
  mark?: ReactNode
  active: boolean
  menuOpen: boolean
  onMenuChange: (open: boolean) => void
  isActiveRow: (t: Pick<DockTile, 'match'>) => boolean
}) {
  const press = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longFired = useRef(false)
  const Icon = tile.Icon
  const hasMenu = !!tile.menu
  /* A tile whose entire content is a menu: a click must open it, never fire one
     of the actions inside. A tile that draws its own thing (the identity mark,
     an avatar) is always one of these — it has no single action to fire. */
  const menuOnly = tile.isGroup || !!tile.render || !tile.onSelect

  const body = (
    <button
      type="button"
      data-tile={tile.id}
      className={classes.tile}
      data-active={String(active)}
      data-fill={tile.fill ? 'true' : undefined}
      data-group={tile.isGroup ? 'true' : undefined}
      data-primary={tile.primary ? 'true' : undefined}
      data-env={tile.env}
      aria-label={tile.label}
      aria-current={active ? 'page' : undefined}
      {...(hasMenu
        ? { 'aria-haspopup': 'menu' as const, 'aria-expanded': menuOpen }
        : {})}
      onPointerDown={() => {
        if (!hasMenu) return
        longFired.current = false
        press.current = setTimeout(() => {
          longFired.current = true
          onMenuChange(true)
        }, 450)
      }}
      onPointerUp={() => press.current && clearTimeout(press.current)}
      onPointerLeave={() => press.current && clearTimeout(press.current)}
      onContextMenu={(e) => {
        // Only intercept where there is actually a menu — otherwise the native
        // one is the honest answer.
        if (!hasMenu) return
        e.preventDefault()
        onMenuChange(true)
      }}
      onClick={() => {
        if (longFired.current) {
          longFired.current = false
          return
        }
        if (hasMenu && menuOnly) {
          onMenuChange(!menuOpen)
          return
        }
        tile.onSelect?.()
      }}
      onKeyDown={(e) => {
        // ArrowUp opens whatever menu the tile has. Without it a leaf's menu was
        // reachable by Shift+F10 and nothing else.
        if (e.key === 'ArrowUp' && hasMenu) {
          e.preventDefault()
          e.stopPropagation()
          onMenuChange(true)
        }
      }}
    >
      {tile.render === 'switcher' ? (
        <span className={classes.mark}>{mark}</span>
      ) : Icon ? (
        <Icon />
      ) : null}
      {tile.badge && (
        <span
          className={classes.tileBadge}
          data-kind={tile.badge.kind}
          style={
            {
              '--pf-badge-color':
                tile.badge.tone === 'error'
                  ? 'var(--pf-status-error)'
                  : tile.badge.tone === 'warn'
                    ? 'var(--pf-status-warn)'
                    : 'var(--app-accent)',
            } as React.CSSProperties
          }
        >
          {tile.badge.text}
        </span>
      )}
    </button>
  )

  /* The shortcut hints live nowhere else, so the tooltip fires on focus as well
     as hover — a keyboard user could otherwise never see them. */
  const tipped = (
    <Tooltip
      label={
        <span className={classes.dockTip}>
          {tile.label}
          {tile.shortcut && (
            <span className={classes.tipKey}>{asI18n(tile.shortcut)}</span>
          )}
        </span>
      }
      position="top"
      openDelay={380}
      offset={10}
      withinPortal
      disabled={menuOpen}
    >
      {body}
    </Tooltip>
  )

  if (!hasMenu) return <span data-zone-item={zone}>{tipped}</span>

  return (
    <Menu
      opened={menuOpen}
      onChange={onMenuChange}
      position="top"
      offset={14}
      withinPortal
      trapFocus
      returnFocus
      classNames={{ dropdown: classes.flyout }}
    >
      <Menu.Target>{tipped}</Menu.Target>
      <DockFlyout
        menu={tile.menu!}
        isActiveRow={isActiveRow}
        onClose={() => onMenuChange(false)}
      />
    </Menu>
  )
}

/** Push the measured tile size onto the element the CSS reads it from. */
function applyTile(el: HTMLElement, t: number) {
  const icon = Math.round(t * 0.52)
  const s = el.style
  s.setProperty('--pf-tile', `${t}px`)
  s.setProperty('--pf-tile-ctx', `${Math.round(t * 0.92)}px`)
  s.setProperty('--pf-icon', `${icon}px`)
  // Rendered stroke = strokeWidth × icon/24. Solving for a constant ~2.0px
  // optical weight keeps the glyphs at the same visual density at every size;
  // baked into the markup the stroke drifted thinner exactly as the tiles got
  // smaller and needed it heavier.
  s.setProperty(
    '--pf-icon-stroke',
    Math.min(2.6, Math.max(1.7, 48 / icon)).toFixed(2)
  )
  s.setProperty('--pf-dock-gap', `${(t * 0.09).toFixed(1)}px`)
  // The strip's open height, so the flyout can cap itself above the capsule.
  // Tile + the capsule's 6px padding either side + the lift it floats at
  // (2 × the 8px card gutter) + the gutter the trigger line itself occupies.
  el.parentElement?.style.setProperty('--pf-dock-foot', `${t + 12 + 24}px`)
}
