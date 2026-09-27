import { toSafeKebab } from '../deploy/analyzer/naming.js'

/**
 * The slug a surface's manifest filename and its deploy unit name are both
 * built from. `deploy-apply` recovers the filename by stripping `mcp-` off the
 * unit name, so codegen and the analyzer have to agree on it exactly or a
 * deployed unit reads a manifest nobody wrote — hence one function, not the
 * same expression written twice.
 */
export const mcpSurfaceSlug = (surface: string): string => toSafeKebab(surface)
