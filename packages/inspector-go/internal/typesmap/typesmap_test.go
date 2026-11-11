package typesmap

import "testing"

// Expected values come from TypesMap in packages/inspector/dist/types-map.js
// given the same calls.
func TestUniqueNamesMatchTS(t *testing.T) {
	m := New()
	u1 := m.AddUniqueType("User", "/a/user.ts")
	u2 := m.AddUniqueType("User", "/b/user.ts")
	m.AddType("Order", "/a/order.ts")
	m.AddCustomType("Custom", "{}", nil)
	if u1 != "User_c0654ceb8772" || u2 != "User_5d2086d149b2" {
		t.Fatalf("AddUniqueType = %s, %s", u1, u2)
	}
	if got := m.Exists("User", "/b/user.ts"); got != u2 {
		t.Errorf("Exists = %q", got)
	}
	for name, want := range map[string]string{
		u1: u1, u2: u2, "User": "User", "Order": "Order", "Custom": "Custom", "string": "string",
	} {
		if got, err := m.GetUniqueName(name); err != nil || got != want {
			t.Errorf("GetUniqueName(%q) = %q, %v; want %q", name, got, err, want)
		}
	}
	if _, err := m.GetUniqueName("Missing"); err == nil || err.Error() != "Type Missing not found in typesMap" {
		t.Errorf("missing type: %v", err)
	}
	if c, _ := m.CustomType("Custom"); c.References == nil {
		t.Error("nil references must encode as []")
	}
}
