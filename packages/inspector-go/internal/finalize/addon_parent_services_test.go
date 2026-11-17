package finalize

import (
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

func parentServicesState(singleton ...string) *state.State {
	st := adminAddonState(false)
	have := state.Strings(singleton)
	wire := state.Strings{}
	st.ServiceTypes = &state.ServiceTypes{SingletonServices: &have, Services: &wire}
	aggregateRequiredServices(st)
	return st
}

func TestAddonFunctionServicesMustBeDeclaredByTheProject(t *testing.T) {
	st := parentServicesState("scopeService")
	log := &diag.Logger{}
	validateAddonParentServices(log, st)
	for _, d := range log.Entries() {
		if d.Code == diag.AddonServiceNotProvided && strings.Contains(d.Message, "scopeService") {
			t.Fatalf("scopeService is declared but was reported: %s", d.Message)
		}
	}

	missing := parentServicesState()
	log = &diag.Logger{}
	validateAddonParentServices(log, missing)
	var found []string
	for _, d := range log.Entries() {
		if d.Code == diag.AddonServiceNotProvided {
			found = append(found, d.Message)
		}
	}
	if len(found) != 1 || !strings.Contains(found[0], "'admin:listScopes'") || !strings.Contains(found[0], "'scopeService'") {
		t.Fatalf("want one report for admin:listScopes, got %v", found)
	}
}

func TestAddonParentServicesAreSkippedWhenTheTypesAreUnresolved(t *testing.T) {
	st := adminAddonState(false)
	aggregateRequiredServices(st)
	log := &diag.Logger{}
	validateAddonParentServices(log, st)
	if len(log.Entries()) != 0 {
		t.Fatalf("reported with no resolved SingletonServices: %v", log.Entries())
	}
}
