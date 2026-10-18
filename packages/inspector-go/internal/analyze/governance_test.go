package analyze

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
)

// The governance fixture exercises every branch of the governance groups;
// parity against TS is checked by `pikku inspector parity` run in
// testdata/governance. This pins the headline outputs so a regression shows
// up in `go test` too.
func TestGovernanceFixture(t *testing.T) {
	root, _ := filepath.Abs("../../testdata/governance")
	var files []string
	_ = filepath.Walk(filepath.Join(root, "src"), func(p string, info os.FileInfo, err error) error {
		if err == nil && strings.HasSuffix(p, ".ts") {
			files = append(files, p)
		}
		return nil
	})
	res, err := Run(protocol.Request{RouteFiles: files, Options: protocol.Options{
		RootDir: root, Tsconfig: filepath.Join(root, "tsconfig.json"),
	}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	st := res.State
	enc := func(v any) string { return string(jsjson.MustMarshal(v)) }

	if n := len(st.Scopes.Definitions); n != 4 {
		t.Errorf("scopes: %d definitions, want 4: %s", n, enc(st.Scopes.Definitions))
	}
	if got := enc(st.Scopes.Declared); got != `[["billing:invoices:read","`+filepath.Join(root, "src/scopes.ts")+`"],["reports:view","`+filepath.Join(root, "src/scopes.ts")+`"]]` {
		t.Errorf("scopes.declared = %s", got)
	}
	if n := len(st.SystemRoles.Definitions); n != 3 {
		t.Errorf("systemRoles: %d, want 3", n)
	}
	if n := len(st.FeatureFlags.Definitions); n != 5 {
		t.Errorf("featureFlags: %d, want 5: %s", n, enc(st.FeatureFlags.Definitions))
	}
	if n := len(st.VirtualUsers.Definitions); n != 4 {
		t.Errorf("virtualUsers: %d, want 4", n)
	}
	if !strings.Contains(enc(st.VirtualUsers.Definitions), `"resume":1e+21`) {
		t.Errorf("virtualUsers tuning lost a large weight: %s", enc(st.VirtualUsers.Definitions))
	}
	if got := st.Workflows.FeatureFiles.Keys(); strings.Join(got, ",") != "checkoutFeature,bare" {
		t.Errorf("featureFiles = %v", got)
	}
	if len(st.Analytics) != 2 || st.Analytics[1].Variable != "renamedEvents" {
		t.Errorf("analytics = %s", enc(st.Analytics))
	}
	if len(st.OutgoingWebhooks) != 2 || st.OutgoingWebhooks[0].Payload == nil || st.OutgoingWebhooks[1].Payload != nil {
		t.Errorf("outgoingWebhooks = %s", enc(st.OutgoingWebhooks))
	}
	usage, ok := st.Secrets.Usage.Get(filepath.Join(root, "src/secrets.ts"))
	if !ok || enc(usage) != `{"keys":["A","B","STRIPE_KEY","TEMPLATE_KEY"],"dynamic":["14:key","15:secrets.getSecret()","16:key","17:keys","18:secrets.getSecrets()"]}` {
		t.Errorf("secrets.usage = %s", enc(usage))
	}
	if got := enc(&st.SurfaceUsage); !strings.Contains(got, `"a":{"imports":2,"seenIn":["src","@fixture/sub"],"files":["src/secrets.ts","src/sub/usage.ts"]}`) {
		t.Errorf("surfaceUsage = %s", got)
	}
	criticals := 0
	for _, d := range res.Diagnostics {
		if d.Level == "critical" {
			criticals++
		}
	}
	if criticals < 30 {
		t.Errorf("only %d critical diagnostics", criticals)
	}
}
