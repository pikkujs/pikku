package visit

// Order keys: index × 10 of every add* call in visit.ts, so a ported group
// slots in at its TS position and there is room for helpers between two.
// Unported groups keep their key here so the table documents the whole sweep.

// visitSetup
const (
	OrderCoreSingletonServices      = 0  // addFileExtendsCoreType CoreSingletonServices
	OrderCoreServices               = 10 // addFileExtendsCoreType CoreServices
	OrderCoreUserSession            = 20 // addFileExtendsCoreType CoreUserSession
	OrderCoreConfig                 = 30 // addFileExtendsCoreType CoreConfig
	OrderCreateSingletonServices    = 40 // addFileWithFactory CreateSingletonServices
	OrderCreateWireServices         = 50 // addFileWithFactory CreateWireServices
	OrderCreateConfig               = 60 // addFileWithFactory CreateConfig
	OrderServerLifecycle            = 70 // addFileWithFactory ServerLifecycle
	OrderAddAnalytics               = 80
	OrderAddOutgoingWebhook         = 90
	OrderAddRPCInvocations          = 100
	OrderAddWireAddon               = 110
	OrderAddPikkuStudio             = 120
	OrderAddWireRemoteAddon         = 130
	OrderAddMiddleware              = 140
	OrderAddPermission              = 150
	OrderCheckIndirectRegistrations = 155
	OrderAddApprovalDescription     = 160
	OrderAddWorkflow                = 170
)

// visitFunctions
const (
	OrderAddFunctions = 0
)

// visitRoutes
const (
	OrderCheckAddonBans   = 0
	OrderAddAuth          = 10
	OrderAddSecret        = 20
	OrderAddCredential    = 30
	OrderAddScope         = 40
	OrderAddSystemRole    = 50
	OrderAddFeatureFlag   = 60
	OrderAddVirtualUsers  = 70
	OrderAddVariable      = 80
	OrderAddHTTPRoute     = 90
	OrderAddHTTPRoutes    = 100
	OrderAddSchedule      = 110
	OrderAddTrigger       = 120
	OrderAddQueueWorker   = 130
	OrderAddChannel       = 140
	OrderAddGateway       = 150
	OrderAddCLI           = 160
	OrderAddCLIRenderers  = 170
	OrderAddMCPResource   = 180
	OrderAddMCPPrompt     = 190
	OrderAddWorkflowGraph = 200
	OrderAddFeature       = 210
	OrderAddAgent         = 220
	OrderAddAgentScorer   = 230
)
