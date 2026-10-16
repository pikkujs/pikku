package visit

import (
	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
)

// Port of add/add-addon-bans.ts.

func init() {
	Register(Visitor{Name: "checkAddonBans", Phase: PhaseRoutes, Order: OrderCheckAddonBans, Visit: (*Context).checkAddonBans})
}

var bannedAddonWirings = map[string]bool{
	"wireAddon": true, "wireRemoteAddon": true, "wireChannel": true, "wireCLI": true,
	"wireGateway": true, "wireHTTP": true, "wireHTTPRoutes": true, "wireMCPPrompt": true,
	"wireMCPResource": true, "wireQueueWorker": true, "wireScheduler": true,
	"wireTrigger": true, "wireTriggerSource": true,
}

var addonContractDefiners = map[string]bool{
	"defineHTTPRoutes": true, "defineChannelRoutes": true, "defineCLICommands": true,
}

func hasHandlerProperty(n *ast.Node) bool {
	found := false
	var visit func(c *ast.Node) bool
	visit = func(c *ast.Node) bool {
		if found {
			return true
		}
		if ast.IsPropertyAssignment(c) {
			if name := c.Name(); (ast.IsIdentifier(name) || ast.IsStringLiteral(name)) && (name.Text() == "middleware" || name.Text() == "permissions") {
				found = true
				return true
			}
		}
		c.ForEachChild(visit)
		return found
	}
	visit(n)
	return found
}

func (s *Context) checkAddonBans(node *ast.Node) {
	if !s.Options.IsAddon || !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) {
		return
	}
	name := node.Expression().Text()
	if bannedAddonWirings[name] {
		s.Log.Critical(diag.AddonWiringNotAllowed, "Addons must not call '"+name+"'. Declare contracts with define* and export functions; the consuming app wires them via refHTTP / refChannel / refCLI.")
		return
	}
	if addonContractDefiners[name] {
		if args := node.Arguments(); len(args) > 0 && hasHandlerProperty(args[0]) {
			s.Log.Critical(diag.AddonContractHandlersNotAllowed, "Addon contract '"+name+"' must not declare middleware or permissions — these are applied by the consuming app, not the addon.")
		}
	}
}
