package surface

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const fixtureIndex = `/** Counts things. */
export const counter = (start: number): number => start + 1

/**
 * Greets someone.
 *
 * More words here.
 * @example
 * greet({ name: 'Ada' })
 */
export function greet(options: {
  /** Who to greet. */
  name: string
  loud?: boolean
}): string {
  return options.name
}

/** @deprecated use greet */
export type Mode = 'quiet' | 'loud'
`

// The TypeScript collectSurface's output for the fixture, with declaredIn
// reduced to the fixture-relative path. greet comes first: Strada binds a
// file's function declarations before its other statements.
const fixtureWant = `[{"subpath":".","specifier":"fixture","entryFile":"src/index.ts","symbols":[` +
	`{"name":"greet","kind":"function","declaredAt":"src/index.ts","declaredIn":"src/index.ts","deprecated":false,` +
	`"summary":"Greets someone.","docs":"Greets someone.\n\nMore words here.",` +
	`"signature":"(options: { name: string; loud?: boolean; }) => string","examples":["greet({ name: 'Ada' })"]},` +
	`{"name":"counter","kind":"function","declaredAt":"src/index.ts","declaredIn":"src/index.ts","deprecated":false,` +
	`"summary":"Counts things.","docs":"Counts things.","signature":"(start: number) => number"},` +
	`{"name":"Mode","kind":"type","declaredAt":"src/index.ts","declaredIn":"src/index.ts","deprecated":true,"deprecatedReason":"use greet"}]}]`

func writeFixture(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	files := map[string]string{
		"package.json":  `{ "name": "fixture", "type": "module", "exports": { ".": "./src/index.ts" } }`,
		"tsconfig.json": `{ "compilerOptions": { "strict": true, "module": "NodeNext", "moduleResolution": "NodeNext", "outDir": "dist" } }`,
		"src/index.ts":  fixtureIndex,
	}
	for name, content := range files {
		path := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func TestCollectFixture(t *testing.T) {
	dir := writeFixture(t)
	entrypoints, err := Collect(dir, Options{})
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entrypoints {
		for i := range e.Symbols {
			if in := e.Symbols[i].DeclaredIn; in != nil {
				rel := filepath.ToSlash((*in)[strings.LastIndex(*in, "/src/")+1:])
				e.Symbols[i].DeclaredIn = &rel
			}
		}
	}
	var b strings.Builder
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(entrypoints); err != nil {
		t.Fatal(err)
	}
	if got := strings.TrimSpace(b.String()); got != fixtureWant {
		t.Fatalf("got  %s\nwant %s", got, fixtureWant)
	}
}

func TestUnknownSnippet(t *testing.T) {
	dir := writeFixture(t)
	index := filepath.Join(dir, "src/index.ts")
	if err := os.WriteFile(index, []byte("/** @example snippet: nope */\nexport const x = 1\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := Collect(dir, Options{Snippets: []Snippet{{Name: "other", Code: "1"}}})
	if _, ok := err.(*UnknownSnippetError); !ok {
		t.Fatalf("want UnknownSnippetError, got %v", err)
	}
}

func TestDoubleQuoteLiterals(t *testing.T) {
	cases := map[string]string{
		`Omit<A, 'secrets'>`: `Omit<A, "secrets">`,
		`{ 'a-b': 'x' }`:     `{ 'a-b': "x" }`,
		`'it\'s' | "ok"`:     `"it's" | "ok"`,
	}
	for in, want := range cases {
		if got := doubleQuoteLiterals(in); got != want {
			t.Errorf("doubleQuoteLiterals(%q) = %q, want %q", in, got, want)
		}
	}
}
