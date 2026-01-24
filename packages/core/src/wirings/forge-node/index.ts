export * from './forge-node.types.js'

// Temporary: Keep deprecated exports until next CLI release
// The published CLI@0.11.3 still generates code using these
export {
  wireCredential as wireForgeCredential,
  type CoreCredential as CoreForgeCredential,
} from '../credential/index.js'
