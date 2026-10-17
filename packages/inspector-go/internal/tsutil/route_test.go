package tsutil

import (
	"reflect"
	"testing"
)

// Expected values are path-to-regexp 8.4.2 output:
// pathToRegexp(p).keys.filter(k => k.type === 'param').map(k => k.name).
func TestPathParamsMatchesPathToRegexp(t *testing.T) {
	cases := []struct {
		path string
		want []string
		err  string
	}{
		{"/users/:id", []string{"id"}, ""},
		{`/a/:"quoted id"/b`, []string{"quoted id"}, ""},
		{"/files/*rest", nil, ""},
		{`/x/\:y/:z`, []string{"z"}, ""},
		{"/u/:id{/:sub}", []string{"id", "sub", "id"}, ""},
		{"/e/:é", []string{"é"}, ""},
		{"/bad/:", nil, "Missing parameter name at index 6: /bad/:; visit https://git.new/pathToRegexpError for info"},
		{"/a/:x:y", nil, `Missing text before "y" param: /a/:x:y; visit https://git.new/pathToRegexpError for info`},
		{"/a/(x)", nil, "Unexpected ( at index 3: /a/(x); visit https://git.new/pathToRegexpError for info"},
		{"/a/{x", nil, "Unexpected end at index 5, expected }: /a/{x; visit https://git.new/pathToRegexpError for info"},
	}
	for _, c := range cases {
		got, err := PathParams(c.path)
		if c.err != "" {
			if err == nil || err.Error() != c.err {
				t.Errorf("%s: err = %v, want %q", c.path, err, c.err)
			}
			continue
		}
		if err != nil || !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s: got %q, %v; want %q", c.path, got, err, c.want)
		}
	}
}

func TestRouteMatchesPattern(t *testing.T) {
	for _, c := range []struct {
		route, pattern string
		want           bool
	}{
		{"/rpc", "/rpc", true},
		{"/rpc/x", "/rpc/*", true},
		{"/a.b", "/a*", true},
		{"/ab", "/a.b", false},
		{"/x", "*", true},
	} {
		if got := RouteMatchesPattern(c.route, c.pattern); got != c.want {
			t.Errorf("RouteMatchesPattern(%q, %q) = %v", c.route, c.pattern, got)
		}
	}
}

// Expected values are funcIdToTypeName from utils/extract-function-name.ts.
func TestFuncIdToTypeName(t *testing.T) {
	for in, want := range map[string]string{
		"getUser": "GetUser", "get-user": "GetUser", "ext:hello": "ExtHello",
		"a__b": "AB", "x@v2": "XV2", "café-ok": "CafOk", "123abc": "123abc", "": "",
	} {
		if got := FuncIdToTypeName(in); got != want {
			t.Errorf("FuncIdToTypeName(%q) = %q, want %q", in, got, want)
		}
	}
}
