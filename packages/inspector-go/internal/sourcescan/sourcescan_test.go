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
