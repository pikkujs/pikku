package finalize

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/analyze"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/protocol"
)

// The cases of packages/inspector/src/add/permission-skip-without-session.test.ts.

const skipHeader = "import { addGlobalPermission, pikkuAuth, pikkuPermission, pikkuPermissionFactory } from '#pikku/auth'\n" +
	"import { pikkuFunc, pikkuSessionlessFunc } from '#pikku/function'\n" +
	"declare const shared: { name: string }\n" +
	"declare const flag: boolean\n" +
	"declare const makeCheck: (value: number) => any\n"

const onSessionless = "export const open = pikkuSessionlessFunc<void, void>({ permissions: { gate }, func: async () => {} })\n"
const onQuota = "export const open = pikkuSessionlessFunc<void, void>({ permissions: { gate: quota(1) }, func: async () => {} })\n"
const bareOpen = "export const open = pikkuSessionlessFunc<void, void>({ func: async () => {} })\n"

func permissionNeedsSkip(t *testing.T, source string) []diag.Diagnostic {
	t.Helper()
	root := t.TempDir()
	file := filepath.Join(root, "security.ts")
	if err := os.WriteFile(file, []byte(skipHeader+source), 0o644); err != nil {
		t.Fatal(err)
	}
	options := protocol.Options{RootDir: root}
	res, err := analyze.Run(protocol.Request{RouteFiles: []string{file}, Options: options}, nil)
	if err != nil {
		t.Fatal(err)
	}
	log := &diag.Logger{}
	validateSessionlessPermissions(log, res.State)
	var out []diag.Diagnostic
	for _, d := range log.Entries() {
		if d.Code == diag.PermissionNeedsSkipWithoutSession {
			out = append(out, d)
		}
	}
	return out
}

func TestPermissionNeedsSkipFlags(t *testing.T) {
	cases := map[string]string{
		"a pikkuAuth on a sessionless function":                  "export const gate = pikkuAuth(async () => true)\n" + onSessionless,
		"a pikkuPermission on a sessionless function":            "export const gate = pikkuPermission(async (_s, data) => !!data)\n" + onSessionless,
		"a config with the option set to false":                  "export const gate = pikkuAuth({ skipWithoutSession: false, func: async () => true })\n" + onSessionless,
		"a factory whose inner permission has no option":         "export const quota = pikkuPermissionFactory((n: number) => pikkuPermission(async (_s, data) => !!data && n > 0))\n" + onQuota,
		"a factory returning a plain function":                   "export const quota = pikkuPermissionFactory((n: number) => async () => n > 0)\n" + onQuota,
		"a global permission when a sessionless function exists": "export const gate = pikkuAuth(async () => true)\naddGlobalPermission([gate])\n" + bareOpen,
		"an inline global permission":                            "addGlobalPermission([pikkuAuth(async () => true)])\n" + bareOpen,
		"a function with auth: false":                            "export const gate = pikkuAuth(async () => true)\nexport const open = pikkuSessionlessFunc<void, void>({ auth: false, permissions: { gate }, func: async () => {} })\n",
	}
	for label, source := range cases {
		t.Run(label, func(t *testing.T) {
			found := permissionNeedsSkip(t, source)
			if len(found) != 1 {
				t.Fatalf("found = %+v, want one", found)
			}
			if !strings.Contains(found[0].Message, "skipWithoutSession: true") {
				t.Fatalf("message = %s", found[0].Message)
			}
		})
	}
}

func TestPermissionNeedsSkipDoesNotFlag(t *testing.T) {
	cases := map[string]string{
		"the option on pikkuAuth":                     "export const gate = pikkuAuth({ skipWithoutSession: true, func: async () => true })\n" + onSessionless,
		"the option on pikkuPermission":               "export const gate = pikkuPermission({ skipWithoutSession: true, func: async (_s, data) => !!data })\n" + onSessionless,
		"the option inside a factory":                 "export const quota = pikkuPermissionFactory((n: number) => pikkuAuth({ skipWithoutSession: true, func: async () => n > 0 }))\n" + onQuota,
		"a pikkuFunc":                                 "export const gate = pikkuAuth(async () => true)\nexport const signedIn = pikkuFunc<void, void>({ permissions: { gate }, func: async () => {} })\n",
		"a sessionless function with auth: true":      "export const gate = pikkuAuth(async () => true)\nexport const signedIn = pikkuSessionlessFunc<void, void>({ auth: true, permissions: { gate }, func: async () => {} })\n",
		"a spread config":                             "export const gate = pikkuAuth({ ...shared, func: async () => true })\n" + onSessionless,
		"an option that is not a literal":             "export const gate = pikkuAuth({ skipWithoutSession: flag, func: async () => true })\n" + onSessionless,
		"a factory whose body cannot be read":         "export const quota = pikkuPermissionFactory((n: number) => makeCheck(n))\n" + onQuota,
		"a permission no sessionless function uses":   "export const gate = pikkuAuth(async () => true)\n" + bareOpen,
		"a global permission with the option":         "addGlobalPermission([pikkuAuth({ skipWithoutSession: true, func: async () => true })])\n" + bareOpen,
		"a global for another package":                "export const gate = pikkuAuth(async () => true)\naddGlobalPermission([gate], '@acme/addon')\n" + bareOpen,
		"a global with only session-required callers": "export const gate = pikkuAuth(async () => true)\naddGlobalPermission([gate])\nexport const signedIn = pikkuFunc<void, void>({ func: async () => {} })\n",
	}
	for label, source := range cases {
		t.Run(label, func(t *testing.T) {
			if found := permissionNeedsSkip(t, source); len(found) != 0 {
				t.Fatalf("found = %+v, want none", found)
			}
		})
	}
}
