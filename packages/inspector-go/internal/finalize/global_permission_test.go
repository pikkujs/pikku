package finalize

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/analyze"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
)

// What global permissions and global middleware touch is required wherever
// any function runs, as in add-global-permission.test.ts.
func TestGlobalPermissionServicesAreRequired(t *testing.T) {
	cases := map[string][]string{
		"an object of permissions": {
			"import { addGlobalPermission, pikkuPermission } from '#pikku/auth'",
			"export const audited = pikkuPermission(async ({ auditLog }) => !!auditLog)",
			"addGlobalPermission({ audited })",
		},
		"a const array of permissions": {
			"import { addGlobalPermission, pikkuPermission } from '#pikku/auth'",
			"export const audited = pikkuPermission(async ({ auditLog }) => !!auditLog)",
			"const gates = [audited] as const",
			"addGlobalPermission(gates)",
		},
		"global middleware": {
			"import { addGlobalMiddleware, pikkuMiddleware } from '#pikku'",
			"export const audit = pikkuMiddleware(async ({ auditLog }, _w, next) => { auditLog; return next() })",
			"addGlobalMiddleware([audit])",
		},
	}
	for label, lines := range cases {
		t.Run(label, func(t *testing.T) {
			root := t.TempDir()
			file := filepath.Join(root, "security.ts")
			if err := os.WriteFile(file, []byte(strings.Join(lines, "\n")), 0o644); err != nil {
				t.Fatal(err)
			}
			res, err := analyze.Run(protocol.Request{RouteFiles: []string{file}, Options: protocol.Options{RootDir: root}}, nil)
			if err != nil {
				t.Fatal(err)
			}
			aggregateRequiredServices(res.State)
			if !res.State.ServiceAggregation.RequiredServices.Has("auditLog") {
				t.Fatalf("requiredServices = %v", res.State.ServiceAggregation.RequiredServices.Values())
			}
		})
	}
}
