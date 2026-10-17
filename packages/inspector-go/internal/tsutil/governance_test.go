package tsutil

import (
	"math"
	"testing"
)

func TestJSNumber(t *testing.T) {
	for text, want := range map[string]float64{
		"3": 3, "0.5": 0.5, "1e21": 1e21, "0x10": 16, "0o17": 15, "0b101": 5, "1_000": 1000, ".5": 0.5,
	} {
		if got := JSNumber(text); got != want {
			t.Errorf("JSNumber(%q) = %v, want %v", text, got, want)
		}
	}
	if !math.IsNaN(JSNumber("nope")) {
		t.Error("JSNumber of garbage is not NaN")
	}
}

func TestJSNumberString(t *testing.T) {
	for f, want := range map[float64]string{
		0: "0", 3: "3", -1: "-1", 0.5: "0.5", -0.5: "-0.5", 1e21: "1e+21", 1.5e22: "1.5e+22",
		123456789012345680000: "123456789012345680000", 0.000001: "0.000001", 1e-7: "1e-7",
		math.Inf(1): "Infinity", math.Inf(-1): "-Infinity",
	} {
		if got := JSNumberString(f); got != want {
			t.Errorf("JSNumberString(%v) = %q, want %q", f, got, want)
		}
	}
	if got := JSNumberString(math.Copysign(0, -1)); got != "0" {
		t.Errorf("String(-0) = %q, want 0", got)
	}
}

func TestCollapseWhitespace(t *testing.T) {
	if got := CollapseWhitespace("z.enum(['a',\n\t  'b'])  x"); got != "z.enum(['a', 'b']) x" {
		t.Errorf("got %q", got)
	}
}
