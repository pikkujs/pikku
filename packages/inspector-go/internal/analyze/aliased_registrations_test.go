package analyze

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
)

// The cases of packages/inspector/src/add/aliased-registrations.test.ts: a
// helper is the helper its callee resolves to, and one passed as a value is
// reported (PKU577).

// inspectFiles analyses files written to a fresh project. With resolveCore the
// project sits inside this package, so `@pikku/core` resolves to the real
// declarations.
func inspectFiles(t *testing.T, files map[string][]string, resolveCore bool) *protocol.Response {
	t.Helper()
	parent := os.TempDir()
	if resolveCore {
		parent, _ = filepath.Abs("../..")
	}
	root, err := os.MkdirTemp(parent, ".tmp-aliased-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(root) })
	var paths []string
	for name, lines := range files {
		p := filepath.Join(root, name)
		if err := os.WriteFile(p, []byte(strings.Join(lines, "\n")), 0o644); err != nil {
			t.Fatal(err)
		}
		paths = append(paths, p)
	}
	res, err := Run(protocol.Request{RouteFiles: paths, Options: protocol.Options{RootDir: root}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func indirect(res *protocol.Response) []string {
	var out []string
	for _, d := range res.Diagnostics {
		if d.Code == diag.RegistrationNotADirectCall {
			out = append(out, d.Message)
		}
	}
	return out
}

func TestAliasedTagMiddlewareRegisters(t *testing.T) {
	res := inspectFiles(t, map[string][]string{"gate.ts": {
		"import { addTagMiddleware as guard, pikkuMiddleware as mw } from '#pikku'",
		"export const lockGate = () =>",
		"  guard('todos', [mw(async (_s, _w, next) => next())])",
	}}, false)
	group := res.State.Middleware.TagMiddleware.At("todos")
	if group == nil {
		t.Fatal("the aliased call must register the todos tag")
	}
	if group.Count != 1 || group.ExportName == nil || *group.ExportName != "lockGate" {
		t.Errorf("group = count %d, exportName %v", group.Count, group.ExportName)
	}
}

func TestNamespacedTagMiddlewareRegisters(t *testing.T) {
	res := inspectFiles(t, map[string][]string{"gate.ts": {
		"import * as pikku from '#pikku'",
		"export const lockGate = () =>",
		"  pikku.addTagMiddleware('todos', [",
		"    pikku.pikkuMiddleware(async (_s, _w, next) => next()),",
		"  ])",
	}}, false)
	if g := res.State.Middleware.TagMiddleware.At("todos"); g == nil || g.Count != 1 {
		t.Fatalf("the namespaced call must register the todos tag once, got %+v", g)
	}
}

func TestAliasedRouteAndGlobalMiddlewareRegister(t *testing.T) {
	res := inspectFiles(t, map[string][]string{"gates.ts": {
		"import { addHTTPMiddleware as onRoute, addGlobalMiddleware as everywhere, pikkuMiddleware } from '#pikku'",
		"const pass = pikkuMiddleware(async (_s, _w, next) => next())",
		"export const routeGate = () => onRoute('/admin/*', [pass])",
		"everywhere([pass])",
	}}, false)
	if !res.State.HTTP.RouteMiddleware.Has("/admin/*") {
		t.Error("onRoute must register /admin/*")
	}
	if n := res.State.Middleware.GlobalFiles.Len(); n != 1 {
		t.Errorf("globalFiles: %d, want 1", n)
	}
}

func TestConstBoundHelperRegisters(t *testing.T) {
	res := inspectFiles(t, map[string][]string{"gate.ts": {
		"import { addTagMiddleware, pikkuMiddleware } from '#pikku'",
		"const guard = addTagMiddleware",
		"export const lockGate = () =>",
		"  guard('todos', [pikkuMiddleware(async (_s, _w, next) => next())])",
	}}, false)
	if res.State.Middleware.TagMiddleware.At("todos") == nil {
		t.Error("a const bound to addTagMiddleware must register the tag")
	}
	if got := indirect(res); len(got) != 0 {
		t.Errorf("a const binding is accounted for, got %v", got)
	}
}

func TestGateHelperUsedAsValueIsReported(t *testing.T) {
	res := inspectFiles(t, map[string][]string{"gate.ts": {
		"import { addTagMiddleware, pikkuPermission } from '#pikku'",
		"const register = (fn: unknown) => fn",
		"register(addTagMiddleware)",
		"export const helpers = { can: pikkuPermission }",
	}}, false)
	got := indirect(res)
	if len(got) != 2 || !strings.Contains(got[0], "addTagMiddleware") || !strings.Contains(got[1], "pikkuPermission") {
		t.Fatalf("want addTagMiddleware then pikkuPermission reported, got %q", got)
	}
}

func TestGateHelperAsValueReportedThroughAliasAndNamespace(t *testing.T) {
	res := inspectFiles(t, map[string][]string{"gate.ts": {
		"import { addTagMiddleware as guard } from '@pikku/core/middleware'",
		"import * as core from '@pikku/core/middleware'",
		"export const pick = (open: boolean) => (open ? undefined : guard)",
		"export const all = [core.addGlobalMiddleware]",
	}}, true)
	got := indirect(res)
	if len(got) != 2 ||
		!regexp.MustCompile(`'guard' \(addTagMiddleware\)`).MatchString(got[0]) ||
		!strings.Contains(got[1], "'core.addGlobalMiddleware'") {
		t.Fatalf("got %q", got)
	}
}

func TestImportsReexportsAndTypesAreNotReported(t *testing.T) {
	res := inspectFiles(t, map[string][]string{"gate.ts": {
		"import { addTagMiddleware, pikkuMiddleware } from '@pikku/core/middleware'",
		"export { addTagMiddleware } from '@pikku/core/middleware'",
		"export type Register = typeof addTagMiddleware",
		"export type Make = ReturnType<typeof pikkuMiddleware>",
	}}, true)
	if got := indirect(res); len(got) != 0 {
		t.Fatalf("want nothing reported, got %q", got)
	}
}
