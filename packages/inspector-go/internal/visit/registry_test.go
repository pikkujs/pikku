package visit

import (
	"testing"

	"github.com/microsoft/typescript-go/shim/ast"
)

func TestVisitorsRunInTSOrder(t *testing.T) {
	for _, p := range []Phase{PhaseSetup, PhaseFunctions, PhaseRoutes} {
		vs := Visitors(p)
		for i := 1; i < len(vs); i++ {
			if vs[i-1].Order >= vs[i].Order {
				t.Errorf("%s: %q (%d) runs before %q (%d)", p, vs[i-1].Name, vs[i-1].Order, vs[i].Name, vs[i].Order)
			}
		}
	}
}

// The ported groups; a new group adds its name here.
func TestRegisteredGroups(t *testing.T) {
	want := map[Phase][]string{
		PhaseSetup: {
			"addFileExtendsCoreType CoreSingletonServices", "addFileExtendsCoreType CoreServices",
			"addFileExtendsCoreType CoreUserSession", "addFileExtendsCoreType CoreConfig",
			"addFileWithFactory CreateSingletonServices", "addFileWithFactory CreateWireServices",
			"addFileWithFactory CreateConfig", "addFileWithFactory ServerLifecycle", "checkHiddenFactory",
			"addAnalytics", "addOutgoingWebhook",
			"addRPCInvocations", "addWireAddon", "addDefineScreens", "addWireRemoteAddon", "addMiddleware", "addPermission", "checkIndirectRegistrations",
			"addApprovalDescription", "addWorkflow",
		},
		PhaseFunctions: {"addFunctions"},
		PhaseRoutes: {
			"checkAddonBans", "addAuth", "addSecret", "addCredential", "addScope", "addSystemRole", "addFeatureFlag", "addVirtualUsers",
			"addVariable", "addHTTPRoute", "addHTTPRoutes", "addSchedule", "addTrigger", "addQueueWorker", "addChannel",
			"addGateway", "addCLI", "addCLIRenderers",
			"addMCPResource", "addMCPPrompt", "addWorkflowGraph", "addFeature", "addAgent", "addAgentScorer",
			"checkDisabledReferences",
		},
	}
	for p, names := range want {
		vs := Visitors(p)
		if len(vs) != len(names) {
			t.Errorf("%s: %d visitors, want %d: %v", p, len(vs), len(names), vs)
			continue
		}
		for i, v := range vs {
			if v.Name != names[i] {
				t.Errorf("%s[%d] = %q, want %q", p, i, v.Name, names[i])
			}
		}
	}
}

func TestRegisterRejectsCollisions(t *testing.T) {
	noop := func(*Context, *ast.Node) {}
	for _, v := range []Visitor{
		{Name: "dup order", Phase: PhaseFunctions, Order: OrderAddFunctions, Visit: noop},
		{Name: "addFunctions", Phase: PhaseFunctions, Order: 9999, Visit: noop},
	} {
		func() {
			defer func() {
				if recover() == nil {
					t.Errorf("Register(%q) did not panic", v.Name)
				}
			}()
			Register(v)
		}()
	}
	if n := len(Visitors(PhaseFunctions)); n != 1 {
		t.Fatalf("a rejected Register changed the registry: %d visitors", n)
	}
}

func TestParseVersionedId(t *testing.T) {
	for _, c := range []struct {
		in   string
		base string
		v    int
	}{
		{"getUser", "getUser", -1},
		{"getUser@v2", "getUser", 2},
		{"getUser@v0", "getUser@v0", -1},
		{"getUser@v1.5", "getUser@v1.5", -1},
		{"a@v1@v3", "a@v1", 3},
		{"getUser@vx", "getUser@vx", -1},
	} {
		base, v := ParseVersionedId(c.in)
		if base != c.base || v != c.v {
			t.Errorf("ParseVersionedId(%q) = %q, %d; want %q, %d", c.in, base, v, c.base, c.v)
		}
	}
}
