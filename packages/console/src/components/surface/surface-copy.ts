import { m } from '@/i18n/messages'
import type { SurfaceEntryPointId, SurfaceStep } from './surface.types'

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

export const ENTRY_POINT_LABEL: Record<SurfaceEntryPointId, () => string> = {
  app: m.surface_entry_app,
  addon: m.surface_entry_addon,
}
