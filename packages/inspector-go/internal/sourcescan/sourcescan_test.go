package sourcescan

import (
	"encoding/json"
	"testing"
)

// Expectations are what the TypeScript originals return for the same input.

func asJSON(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestReadJsxLiteralText(t *testing.T) {
	src := "export const A = () => (\n  <div title=\"Open the menu\">\n    Hello there\n" +
		"    {ok ? 'Saved changes' : \"Could not save\"}\n" +
		"    <input placeholder=\"x1\" data-x=\"Some words here\" />\n  </div>\n)\n"
	want := `[{"text":"Open the menu","line":2},{"text":"Hello there","line":3},` +
		`{"text":"Saved changes","line":4},{"text":"Could not save","line":4},` +
		`{"text":"x1","line":5},{"text":"Some words here","line":5}]`
	if got := asJSON(t, ReadJsxLiteralText("a.tsx", src)); got != want {
		t.Fatalf("got  %s\nwant %s", got, want)
	}
}

func TestReadJsxLiteralTextSkipsClassBuilders(t *testing.T) {
	src := "const v = cva('leading-none', { variants: { size: { heading: 'font-heading text-xl', title: 'Big Title Here' } } })\n" +
		"export const A = () => <p className={cn('Flex Gap', x)}>{cn('a b')}</p>\n"
	if got := asJSON(t, ReadJsxLiteralText("a.tsx", src)); got != "[]" {
		t.Fatalf("got %s, want []", got)
	}
}

func TestReadModuleSpecifiers(t *testing.T) {
	src := "import a from './a.js'\nimport type { B } from \"b\"\nexport * from './c.js'\n" +
		"export { d } from './d.js'\nconst t = `import x from 'not-an-import'`\n" +
		"const e = await import('./e.js')\n"
	want := `["./a.js","b","./c.js","./d.js"]`
	if got := asJSON(t, ReadModuleSpecifiers("m.ts", src)); got != want {
		t.Fatalf("got  %s\nwant %s", got, want)
	}
}

// git ls-files hands scanFrontend relative names, which typescript-go's
// parser rejects unless Parse roots them.
func TestScanHooksRelativeFileName(t *testing.T) {
	src := "import { usePikkuQuery, usePikkuQueryStub } from '../pikku/react-query'\n" +
		"export const X = () => {\n  usePikkuQuery('getOrder', {})\n" +
		"  usePikkuQueryStub('listOrders', {}, { flag: 'orders' })\n}\n"
	want := `[{"file":"src/x.tsx","line":3,"hook":"usePikkuQuery","rpc":"getOrder","stub":false},` +
		`{"file":"src/x.tsx","line":4,"hook":"usePikkuQueryStub","rpc":"listOrders","problem":"no-flag","stub":true}]`
	if got := asJSON(t, ScanHooks("src/x.tsx", src, nil)); got != want {
		t.Fatalf("got  %s\nwant %s", got, want)
	}
}

func TestReadSyntaxErrors(t *testing.T) {
	cases := []struct {
		name    string
		content string
		bad     bool
	}{
		{"plain function", "async function f(){\nreturn 1\n}", false},
		{"octal literal is a hard parse failure", "async function __n8n(){\nconst a = 00000000\n}", true},
		{"html comment", "async function __n8n(){\nreturn <!-- x\n}", true},
		{"unterminated string", "async function f(){ return 'a }", true},
	}
	for _, c := range cases {
		got := ReadSyntaxErrors("", c.content)
		if (len(got) > 0) != c.bad {
			t.Errorf("%s: got %v, want errors=%v", c.name, got, c.bad)
		}
	}
}

func TestReadSyntaxErrorsParsesTsxByExtension(t *testing.T) {
	jsx := "const a = <div className=\"x\" />"
	if got := ReadSyntaxErrors("x.tsx", jsx); len(got) != 0 {
		t.Errorf("tsx should parse JSX, got %v", got)
	}
	if got := ReadSyntaxErrors("x.ts", jsx); len(got) == 0 {
		t.Error("ts should reject JSX")
	}
	if got := ReadSyntaxErrors("x.tsx", "const a = <div"); len(got) == 0 {
		t.Error("an unterminated element is a syntax error")
	}
}

func TestFindWireRemoteAddonLiterals(t *testing.T) {
	source := "import { wireRemoteAddon } from '@pikku/core/addon'\nwireRemoteAddon({\n  name: 'cloudapi',\n  package: '@scope/name@^1.4.0',\n  serverUrl: 'https://api.example.com',\n})\nwireRemoteAddon({ name: 'legacy', package: \"@pikkustudio/addon-registry\", serverUrl: '' })\nwireRemoteAddon({ name: 'dyn', package: PKG, serverUrl: '' })\nwireRemoteAddon({ package: `tpl` })\n"
	got := FindWireRemoteAddonLiterals("wiring.ts", source)
	cloud, legacy := "cloudapi", "legacy"
	want := []RemoteAddonLiteral{
		{Namespace: &cloud, Spec: "@scope/name@^1.4.0", Line: 4},
		{Namespace: &legacy, Spec: "@pikkustudio/addon-registry", Line: 7},
		{Spec: "tpl", Line: 9},
	}
	if len(got) != len(want) {
		t.Fatalf("got %+v", got)
	}
	for i := range want {
		if got[i].Spec != want[i].Spec || got[i].Line != want[i].Line || (got[i].Namespace == nil) != (want[i].Namespace == nil) ||
			(got[i].Namespace != nil && *got[i].Namespace != *want[i].Namespace) {
			t.Errorf("entry %d: got %+v, want %+v", i, got[i], want[i])
		}
	}
	if len(FindWireRemoteAddonLiterals("a.ts", "const a = 1")) != 0 {
		t.Error("a file without the call has none")
	}
}
