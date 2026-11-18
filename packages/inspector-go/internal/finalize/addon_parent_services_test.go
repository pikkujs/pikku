package finalize

import (
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

func parentServicesState(singleton ...string) *state.State {
	return parentServicesStateWith(nil, singleton...)
}

func parentServicesStateWith(wireServices []string, singleton ...string) *state.State {
	st := adminAddonState(false)
	have := state.Strings(singleton)
	wire := state.Strings(wireServices)
	if wire == nil {
		wire = state.Strings{}
	}
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

func parentServiceReports(t *testing.T, st *state.State) []string {
	t.Helper()
	log := &diag.Logger{}
	validateAddonParentServices(log, st)
	var found []string
	for _, d := range log.Entries() {
		if d.Code == diag.AddonServiceNotProvided {
			found = append(found, d.Message)
		}
	}
	return found
}

func TestAWireServiceDoesNotProvideWhatAnAddonTakesFromItsProject(t *testing.T) {
	found := parentServiceReports(t, parentServicesStateWith([]string{"scopeService"}))
	if len(found) != 1 || !strings.Contains(found[0], "'scopeService'") {
		t.Fatalf("a service declared only as a wire service was accepted: %v", found)
	}
}

func TestAnAddonFunctionWithUnoptimizedServicesIsCheckedForEveryParentService(t *testing.T) {
	build := func(singleton ...string) *state.State {
		st := parentServicesState(singleton...)
		fns, _ := st.AddonFunctions.Get("admin")
		fns.Set("legacy", &state.FunctionMeta{})
		st.ServiceAggregation.UsedFunctions = *state.NewSet()
		st.ServiceAggregation.UsedFunctions.Add("admin:legacy")
		aggregateRequiredServices(st)
		return st
	}
	found := parentServiceReports(t, build())
	if len(found) != 1 || !strings.Contains(found[0], "'admin:legacy'") || !strings.Contains(found[0], "'scopeService'") {
		t.Fatalf("want one report for admin:legacy naming scopeService, got %v", found)
	}
	if found := parentServiceReports(t, build("scopeService")); len(found) != 0 {
		t.Fatalf("scopeService is declared but was reported: %v", found)
	}
}
