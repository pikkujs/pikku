/**
 * Type constraint: MCP resource URI parameters must match function input types
 *
 * When a resource URI contains parameters (e.g., 'user/{userId}'),
 * the function's input type must include those parameters.
 */

import {
  wireMCPResource,
  pikkuMCPResourceFunc,
} from '../../.pikku/pikku-types.gen.js'

// Valid: URI params match function input type
wireMCPResource({
  uri: 'user/{userId}',
  title: 'User Resource',
  description: 'Get user by ID',
  func: pikkuMCPResourceFunc<{ userId: string }>(
    async ({ mcp }, {}, { userId }) => {
      return [{ uri: mcp.uri!, text: JSON.stringify({ userId }) }]
    }
  ),
})

// @ts-expect-error - URI has {userId} param but function input type is empty
wireMCPResource({
  uri: 'user/{userId}',
  title: 'User Resource',
  description: 'Get user by ID',
  func: pikkuMCPResourceFunc<unknown>(async ({ mcp }, {}) => {
    return [{ uri: mcp.uri!, text: 'data' }]
  }),
})

// @ts-expect-error - URI has {userId} param but function has wrong property name
wireMCPResource({
  uri: 'user/{userId}',
  title: 'User Resource',
  description: 'Get user by ID',
  func: pikkuMCPResourceFunc<{ id: string }>(async ({ mcp }, {}, { id }) => {
    return [{ uri: mcp.uri!, text: JSON.stringify({ id }) }]
  }),
})

// Valid: Multiple URI parameters
wireMCPResource({
  uri: 'user/{userId}/posts/{postId}',
  title: 'User Post Resource',
  description: 'Get user post',
  func: pikkuMCPResourceFunc<{ userId: string; postId: string }>(
    async ({ mcp }, {}, { userId, postId }) => {
      return [{ uri: mcp.uri!, text: JSON.stringify({ userId, postId }) }]
    }
  ),
})

// @ts-expect-error - Missing one of the URI params in function type
wireMCPResource({
  uri: 'user/{userId}/posts/{postId}',
  title: 'User Post Resource',
  description: 'Get user post',
  func: pikkuMCPResourceFunc<{ userId: string }>(
    async ({ mcp }, {}, { userId }) => {
      return [{ uri: mcp.uri!, text: JSON.stringify({ userId }) }]
    }
  ),
})

// Valid: No URI parameters
wireMCPResource({
  uri: 'static-resource',
  title: 'Static Resource',
  description: 'Get static data',
  func: pikkuMCPResourceFunc<unknown>(async ({ mcp }, {}) => {
    return [{ uri: mcp.uri!, text: 'static data' }]
  }),
})

wireMCPResource({
  uri: 'invalid-return',
  title: 'Invalid Return',
  description: 'Invalid return type',
  // @ts-expect-error - Return type must be array of resources with uri and text
  func: pikkuMCPResourceFunc<unknown>(async () => {
    return 'invalid'
  }),
})

wireMCPResource({
  uri: 'invalid-structure',
  title: 'Invalid Structure',
  description: 'Invalid resource structure',
  // @ts-expect-error - Resource objects must have uri and text properties
  func: pikkuMCPResourceFunc<unknown>(async () => {
    return [{ data: 'invalid' }]
  }),
})

// Valid: Resource with additional data in text
wireMCPResource({
  uri: 'user/{userId}',
  title: 'User with Details',
  description: 'Get user with full details',
  func: pikkuMCPResourceFunc<{ userId: string }>(
    async ({ mcp }, {}, { userId }) => {
      const userData = { userId, name: 'John', email: 'john@example.com' }
      return [{ uri: mcp.uri!, text: JSON.stringify(userData) }]
    }
  ),
})
