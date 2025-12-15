export * from './forge-node.types.js'

// Deprecated: Use @pikku/core/credential instead
export {
  /** @deprecated Use wireCredential from @pikku/core/credential instead */
  wireCredential as wireForgeCredential,
  /** @deprecated Use CoreCredential from @pikku/core/credential instead */
  type CoreCredential as CoreForgeCredential,
} from '../credential/index.js'
