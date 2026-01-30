// Import all wirings to register them

// HTTP wirings
import './functions/http/http.wiring.js'
import './functions/http/sse.wiring.js'
import './functions/http/progressive-enhancement.wiring.js'
import './functions/http/external.wiring.js'
import './functions/http/zod.wiring.js'

// Channel wirings
import './functions/channel/channel.wiring.js'

// CLI wirings
import './functions/cli/cli.wiring.js'

// MCP wirings
import './functions/mcp/mcp.wiring.js'

// Queue wirings
import './functions/queue/queue.wiring.js'

// Scheduler wirings
import './functions/scheduler/scheduler.wiring.js'

// RPC wirings
import './functions/rpc/rpc.wiring.js'

// Trigger wirings
import './functions/trigger/trigger.wiring.js'

// Workflow wirings
import './functions/workflow/workflow.wiring.js'
