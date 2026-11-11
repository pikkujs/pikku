package finalize

import (
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

func adminAddonState(blanket bool) *state.State {
	st := state.New(".")
	fns := state.NewRecord[*state.FunctionMeta]()
	fns.Set("listIncomingWebhookReceipts", &state.FunctionMeta{Services: state.ServicesMeta{Optimized: true, Services: []string{"incomingWebhookService"}}})
	fns.Set("listScopes", &state.FunctionMeta{Services: state.ServicesMeta{Optimized: true, Services: []string{"scopeService"}}})
	if blanket {
		fns.Set("ownStore", &state.FunctionMeta{Services: state.ServicesMeta{Optimized: true, Services: []string{"addonOwnStore"}}})
		st.ServiceAggregation.UsedFunctions.Add("admin:ownStore")
	}
	st.AddonFunctions.Set("admin", fns)
	st.AddonRequiredParentServices = state.Strings{"scopeService", "incomingWebhookService"}
	st.ServiceAggregation.UsedFunctions.Add("admin:listIncomingWebhookReceipts")
	st.ServiceAggregation.UsedFunctions.Add("admin:listScopes")
	return st
}

func TestAddonForwardedIncomingWebhookServiceNeedsAWebhookWiring(t *testing.T) {
	for label, blanket := range map[string]bool{"per function": false, "parent blanket": true} {
		t.Run(label, func(t *testing.T) {
			st := adminAddonState(blanket)
			aggregateRequiredServices(st)
			required := st.ServiceAggregation.RequiredServices
			if required.Has("incomingWebhookService") {
				t.Fatalf("incomingWebhookService required without a webhook wiring: %v", required.Values())
			}
			if !required.Has("scopeService") {
				t.Fatalf("scopeService dropped: %v", required.Values())
			}
		})
	}
}

func TestWiredIncomingWebhooksStillRequireTheService(t *testing.T) {
	st := adminAddonState(false)
	st.Functions.Meta.Set("queue:pikku-incoming-webhooks", &state.FunctionMeta{})
	aggregateRequiredServices(st)
	if !st.ServiceAggregation.RequiredServices.Has("incomingWebhookService") {
		t.Fatalf("requiredServices = %v", st.ServiceAggregation.RequiredServices.Values())
	}
}
