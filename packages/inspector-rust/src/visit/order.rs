//! Order keys: index x 10 of every `add*` call in `visit.ts` (Go `visit/order.go`),
//! so a ported group slots in at its TS position and there is room for helpers
//! between two.


// visitSetup
pub const CORE_SINGLETON_SERVICES: i32 = 0; // addFileExtendsCoreType CoreSingletonServices
pub const CORE_SERVICES: i32 = 10; // addFileExtendsCoreType CoreServices
pub const CORE_USER_SESSION: i32 = 20; // addFileExtendsCoreType CoreUserSession
pub const CORE_CONFIG: i32 = 30; // addFileExtendsCoreType CoreConfig
pub const CREATE_SINGLETON_SERVICES: i32 = 40; // addFileWithFactory CreateSingletonServices
pub const CREATE_WIRE_SERVICES: i32 = 50; // addFileWithFactory CreateWireServices
pub const CREATE_CONFIG: i32 = 60; // addFileWithFactory CreateConfig
pub const SERVER_LIFECYCLE: i32 = 70; // addFileWithFactory ServerLifecycle
pub const CHECK_HIDDEN_FACTORY: i32 = 75;
pub const ADD_ANALYTICS: i32 = 80;
pub const ADD_OUTGOING_WEBHOOK: i32 = 90;
pub const ADD_RPC_INVOCATIONS: i32 = 100;
pub const ADD_WIRE_ADDON: i32 = 110;
pub const ADD_PIKKU_STUDIO: i32 = 120;
pub const ADD_DEFINE_CONTRIBUTORS: i32 = 125;
pub const ADD_WIRE_CONTRIBUTORS: i32 = 126;
pub const ADD_WIRE_REMOTE_ADDON: i32 = 130;
pub const ADD_MIDDLEWARE: i32 = 140;
pub const ADD_PERMISSION: i32 = 150;
pub const CHECK_INDIRECT_REGISTRATIONS: i32 = 155;
pub const ADD_APPROVAL_DESCRIPTION: i32 = 160;
pub const ADD_WORKFLOW: i32 = 170;

// visitFunctions
pub const ADD_FUNCTIONS: i32 = 0;

// visitRoutes
pub const CHECK_ADDON_BANS: i32 = 0;
pub const ADD_AUTH: i32 = 10;
pub const ADD_SECRET: i32 = 20;
pub const ADD_CREDENTIAL: i32 = 30;
pub const ADD_SCOPE: i32 = 40;
pub const ADD_SYSTEM_ROLE: i32 = 50;
pub const ADD_FEATURE_FLAG: i32 = 60;
pub const ADD_VIRTUAL_USERS: i32 = 70;
pub const ADD_VARIABLE: i32 = 80;
pub const ADD_HTTP_ROUTE: i32 = 90;
pub const ADD_HTTP_ROUTES: i32 = 100;
pub const ADD_SCHEDULE: i32 = 110;
pub const ADD_TRIGGER: i32 = 120;
pub const ADD_QUEUE_WORKER: i32 = 130;
pub const ADD_CHANNEL: i32 = 140;
pub const ADD_GATEWAY: i32 = 150;
pub const ADD_CLI: i32 = 160;
pub const ADD_CLI_RENDERERS: i32 = 170;
pub const ADD_MCP_RESOURCE: i32 = 180;
pub const ADD_MCP_PROMPT: i32 = 190;
pub const ADD_WORKFLOW_GRAPH: i32 = 200;
pub const ADD_FEATURE: i32 = 210;
pub const ADD_AGENT: i32 = 220;
pub const ADD_AGENT_SCORER: i32 = 230;
pub const CHECK_DISABLED_REFS: i32 = 240;
