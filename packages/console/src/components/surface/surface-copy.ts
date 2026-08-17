import { m } from '@/i18n/messages'
import type { I18nString } from '@pikku/react'
import type {
  SurfaceEntryPointId,
  SurfaceOrigin,
  SurfaceStep,
} from './surface.types'

/** Where a symbol was declared, as a sentence rather than a path. */
export const originText = (origin: SurfaceOrigin): string => {
  if (origin.via === 'core') {
    return m.surface_origin_core({ subpath: origin.subpath })
  }
  if (origin.via === 'package') {
    return m.surface_origin_package({ packageName: origin.packageName })
  }
  return m.surface_origin_generated()
}

/**
 * A step's prose is fixed UI copy, so it is a message rather than a string in
 * the data. There is no runtime key resolver: mapping the discriminant to the
 * message *function* is what makes a renamed message a build failure instead of
 * a console warning.
 */
export const STEP_PROSE: Record<SurfaceStep, () => string> = {
  'create a function': m.surface_step_create_a_function,
  'enhance it': m.surface_step_enhance_it,
  'wire it up': m.surface_step_wire_it_up,
  'guard it': m.surface_step_guard_it,
  'orchestrate it': m.surface_step_orchestrate_it,
  'test it': m.surface_step_test_it,
}

export const ENTRY_POINT_LABEL: Record<SurfaceEntryPointId, () => I18nString> =
  {
    app: m.surface_entry_app,
    addon: m.surface_entry_addon,
  }
