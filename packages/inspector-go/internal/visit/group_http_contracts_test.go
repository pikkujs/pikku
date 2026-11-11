package visit

import (
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

func TestPropJSON(t *testing.T) {
	f := 30.0
	cases := []struct {
		in   tsutil.PropValue
		want string
	}{
		{tsutil.PropValue{}, "null"},
		{tsutil.PropValue{Present: true, Bool: tsutil.BoolPtr(false)}, "false"},
		{tsutil.PropValue{Present: true, Num: &f}, "30"},
		{tsutil.PropValue{Present: true, Str: tsutil.StrPtr("get")}, `"get"`},
		{tsutil.PropValue{Present: true, Strs: []string{"a"}}, `["a"]`},
	}
	for _, c := range cases {
		o := &jsObject{}
		o.set("v", propJSON(c.in))
		if got := string(o.raw()); got != `{"v":`+c.want+`}` {
			t.Errorf("propJSON(%+v) = %s", c.in, got)
		}
	}
}
