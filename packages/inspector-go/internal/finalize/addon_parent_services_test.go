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

// Two addons wired into one project: `mail` takes `mailer` and `tools` takes
// `scopeService`. The project provides neither.
func twoAddonState(toolServices []string, singleton ...string) *state.State {
	st := parentServicesState(singleton...)
	mail := state.NewRecord[*state.FunctionMeta]()
	mail.Set("send", &state.FunctionMeta{Services: state.ServicesMeta{Optimized: true, Services: []string{"mailer"}}})
	st.AddonFunctions.Set("mail", mail)
	tools := state.NewRecord[*state.FunctionMeta]()
	meta := &state.FunctionMeta{}
	if toolServices != nil {
		meta.Services = state.ServicesMeta{Optimized: true, Services: toolServices}
	}
	tools.Set("greet", meta)
	st.AddonFunctions.Set("tools", tools)
	st.AddonRequiredParentServices = state.Strings{"mailer", "scopeService"}
	st.AddonRequiredParentServicesByNamespace = map[string][]string{"mail": {"mailer"}, "tools": {"scopeService"}}
	st.ServiceAggregation.UsedFunctions = *state.NewSet()
	st.ServiceAggregation.UsedFunctions.Add("mail:send")
	st.ServiceAggregation.UsedFunctions.Add("tools:greet")
	aggregateRequiredServices(st)
	return st
}

func TestAnUnoptimizedFunctionIsBlamedOnlyForItsOwnAddonsParentServices(t *testing.T) {
	found := parentServiceReports(t, twoAddonState(nil, "scopeService"))
	for _, msg := range found {
		if strings.Contains(msg, "'tools:greet'") {
			t.Fatalf("tools:greet blamed for a service only mail needs: %v", found)
		}
	}
	if len(found) != 1 || !strings.Contains(found[0], "'mail:send'") || !strings.Contains(found[0], "'mailer'") {
		t.Fatalf("want one report for mail:send, got %v", found)
	}
	found = parentServiceReports(t, twoAddonState(nil, "mailer"))
	if len(found) != 1 || !strings.Contains(found[0], "'tools:greet'") || !strings.Contains(found[0], "'scopeService'") {
		t.Fatalf("want one report for tools:greet naming scopeService, got %v", found)
	}
}

func TestAFunctionUsingAServiceOutsideTheProjectChecksItsAddonsWholeParentList(t *testing.T) {
	// greet lists only its own service, but the addon's factory is built from
	// everything the addon takes from the project, so scopeService must exist.
	found := parentServiceReports(t, twoAddonState([]string{"toolsOwnStore"}, "mailer"))
	if len(found) != 1 || !strings.Contains(found[0], "'tools:greet'") || !strings.Contains(found[0], "'scopeService'") {
		t.Fatalf("want one report for tools:greet naming scopeService, got %v", found)
	}
	if found := parentServiceReports(t, twoAddonState([]string{"toolsOwnStore"}, "mailer", "scopeService")); len(found) != 0 {
		t.Fatalf("everything is declared but %v was reported", found)
	}
}
