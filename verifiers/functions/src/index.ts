// Import all wirings to register them

// HTTP wirings
import './functions/http/http.wiring.js'
import './functions/http/sse.wiring.js'
import './functions/http/progressive-enhancement.wiring.js'
import './functions/http/addon.wiring.js'
import './functions/http/zod.wiring.js'

// Channel wirings
import './functions/channel/channel.wiring.js'
import './functions/channel/channel-addon.wiring.js'

// CLI wirings
import './functions/cli/cli.wiring.js'
import './functions/cli/cli-addon.wiring.js'

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
import './functions/workflow/workflow.functions.js'
import './functions/workflow/workflow.graph.js'
