package finalize

import (
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// A remote function's callers are other services, so its contract is
// versioned like any other; only webhook receivers stay out.
func TestContractsIncludeRemoteFunctions(t *testing.T) {
	yes := true
	st := state.New(t.TempDir())
	st.Functions.Meta.Set("remoteFunc", &state.FunctionMeta{Remote: &yes, ContractHash: "remotehash123456"})
	st.Functions.Meta.Set("remoteFunc@v2", &state.FunctionMeta{Remote: &yes, ContractHash: "remotehash654321"})
	st.Functions.Meta.Set("hook", &state.FunctionMeta{WebhookReceive: &yes, ContractHash: "hookhash12345678"})

	extracted := ExtractContractsFromMeta(st)
	if extracted.Get("remoteFunc") == nil || extracted.Get("remoteFunc@v2") == nil {
		t.Fatalf("remote functions missing from extracted contracts: %v", extracted.IDs())
	}
	if extracted.Get("hook") != nil {
		t.Fatalf("webhook receiver should not carry a contract")
	}
	if e := extracted.Get("remoteFunc@v2"); e.FunctionKey != "remoteFunc" || e.Version != 2 {
		t.Fatalf("remoteFunc@v2 = %+v", e)
	}

	built := BuildCurrentContracts(st)
	if built.Get("remoteFunc") == nil || built.Get("hook") != nil {
		t.Fatalf("BuildCurrentContracts ids = %v", built.IDs())
	}
}

// A mocked function has no contract yet: its shape may change freely until it
// is implemented, so the version manifest leaves it out. The Rust inspector
// asserts the same in finalize/tests.rs.
func TestContractsLeaveOutMockedFunctions(t *testing.T) {
	yes := true
	st := state.New(t.TempDir())
	st.Functions.Meta.Set("realFunc", &state.FunctionMeta{ContractHash: "realhash12345678"})
	st.Functions.Meta.Set("mockedFunc", &state.FunctionMeta{Mock: &yes, ContractHash: "mockhash12345678"})

	extracted := ExtractContractsFromMeta(st)
	if extracted.Get("realFunc") == nil {
		t.Fatalf("realFunc missing from extracted contracts: %v", extracted.IDs())
	}
	if extracted.Get("mockedFunc") != nil {
		t.Fatalf("a mocked function should not carry a contract")
	}
}
