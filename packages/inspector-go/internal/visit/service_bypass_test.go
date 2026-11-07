package visit

import (
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/core"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/sourcescan"
)

func bypassOf(src string) (string, string) {
	sf := sourcescan.Parse("/project/src/f.ts", src, core.ScriptKindTS)
	b := ExtractServiceBypass(sf)
	return strings.Join(b.Content, "|"), strings.Join(b.Variables, "|")
}

func TestExtractServiceBypassContent(t *testing.T) {
	for name, tc := range map[string]struct{ src, want string }{
		"static import":      {"import { readFile } from 'node:fs/promises'", "1:import 'node:fs/promises'"},
		"bare fs":            {"import fs from 'fs'", "1:import 'fs'"},
		"namespace":          {"import * as fs from 'fs/promises'", "1:import 'fs/promises'"},
		"side effect":        {"import 'node:fs'", "1:import 'node:fs'"},
		"re-export":          {"export { readFile } from 'fs'", "1:export from 'fs'"},
		"require":            {"const fs = require('node:fs')", "1:require('node:fs')"},
		"import equals":      {"import fs = require('fs')", "1:require('fs')"},
		"dynamic import":     {"const m = await import('fs/promises')", "1:import('fs/promises')"},
		"type only":          {"import type { Stats } from 'node:fs'", ""},
		"path":               {"import path from 'node:path'", ""},
		"local fs variable":  {"const fs = { readFile: () => 1 }\nfs.readFile()", ""},
		"string mention":     {"const s = \"import fs from 'fs'\"", ""},
		"non literal import": {"const m = await import(name)", ""},
	} {
		if got, _ := bypassOf(tc.src); got != tc.want {
			t.Errorf("%s: content = %q, want %q", name, got, tc.want)
		}
	}
}

func TestExtractServiceBypassVariables(t *testing.T) {
	for name, tc := range map[string]struct{ src, want string }{
		"dot":               {"const a = process.env.API_URL", "1:process.env.API_URL"},
		"element":           {"const a = process.env['API_URL']", "1:process.env['API_URL']"},
		"destructure":       {"const { API_URL } = process.env", "1:process.env"},
		"env from":          {"const { env } = process", "1:const { env } = process"},
		"env renamed":       {"const { env: e } = process", "1:const { env } = process"},
		"spread":            {"const a = { ...process.env }", "1:process.env"},
		"string mention":    {"const s = 'process.env.X'", ""},
		"other process":     {"const a = process.argv", ""},
		"globalThis":        {"const a = globalThis.process.env.X", "1:process.env.X"},
		"global":            {"const a = global.process.env['X']", "1:process.env['X']"},
		"globalThis env":    {"const { env } = globalThis.process", "1:const { env } = process"},
		"local globalThis":  {"const globalThis = { process: { env: {} } }\nconst a = globalThis.env.X", ""},
		"local obj process": {"const o = { process: { env: 1 } }\nconst a = o.process.env", ""},
		"local env":         {"const env = { X: 1 }\nenv.X", ""},
	} {
		if _, got := bypassOf(tc.src); got != tc.want {
			t.Errorf("%s: variables = %q, want %q", name, got, tc.want)
		}
	}
}

func TestIsServiceBypassExempt(t *testing.T) {
	for _, tc := range []struct {
		root, file string
		want       bool
	}{
		{"/p", "/p/src/a.ts", false},
		{"/p", "/p/src/a.test.ts", true},
		{"/p", "/p/src/a.spec.ts", true},
		{"/p", "/p/src/auth.gen.ts", true},
		{"/p", "/p/.pikku/x/y.ts", true},
		{"/p", "/p/src/types.d.ts", true},
		{"/p", "/p/src/test-helpers.ts", false},
		{"/p", "/p/src/.pikkuish/a.ts", false},
		{"/home/u/.pikku/work/app", "/home/u/.pikku/work/app/src/a.ts", false},
		{"/home/u/.pikku/work/app", "/home/u/.pikku/work/app/.pikku/x/y.ts", true},
		{"/p", "/other/pkg/.pikku/x.ts", true},
		{"/p", "/other/pkg/src/a.ts", false},
	} {
		if got := IsServiceBypassExempt(tc.root, tc.file); got != tc.want {
			t.Errorf("IsServiceBypassExempt(%q, %q) = %v, want %v", tc.root, tc.file, got, tc.want)
		}
	}
}
