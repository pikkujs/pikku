package visit

import (
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

func TestResolveLatestVersionsCarriesRemoteVersions(t *testing.T) {
	yes, one := true, 1
	s := &Context{State: state.New(t.TempDir())}
	meta := &s.State.Functions.Meta
	meta.Set("createUser@v1", &FunctionMeta{PikkuFuncId: "createUser@v1", Version: &one, Remote: &yes})
	meta.Set("createUser", &FunctionMeta{PikkuFuncId: "createUser", Remote: &yes})
	meta.Set("listUsers@v1", &FunctionMeta{PikkuFuncId: "listUsers@v1", Version: &one})
	s.State.RPC.RemoteMeta.Set("createUser", "createUser")

	s.ResolveLatestVersions()

	rm := s.State.RPC.RemoteMeta
	for key, want := range map[string]string{
		"createUser":    "createUser@v2",
		"createUser@v1": "createUser@v1",
		"createUser@v2": "createUser@v2",
		"listUsers":     "",
		"listUsers@v1":  "",
	} {
		if got := rm.At(key); got != want {
			t.Errorf("remoteMeta[%q] = %q, want %q", key, got, want)
		}
	}
}
