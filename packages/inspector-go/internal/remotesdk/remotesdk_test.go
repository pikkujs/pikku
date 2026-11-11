package remotesdk

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParsePackage(t *testing.T) {
	cases := []struct{ spec, name, rng string }{
		{"@pikkustudio/addon-cloud-api@^1.4.0", "@pikkustudio/addon-cloud-api", "^1.4.0"},
		{"mail@1.0.0", "mail", "1.0.0"},
		{"@pikkustudio/addon-registry", "@pikkustudio/addon-registry", ""},
		{"mail", "mail", ""},
	}
	for _, c := range cases {
		name, rng, err := ParsePackage(c.spec)
		if err != nil || name != c.name || rng != c.rng {
			t.Errorf("ParsePackage(%q) = %q, %q, %v", c.spec, name, rng, err)
		}
	}
	if _, _, err := ParsePackage("@scope/x@"); err == nil {
		t.Error("a trailing @ should be refused")
	}
}

func TestCheck(t *testing.T) {
	root := t.TempDir()
	name := "@pikkustudio/addon-cloud-api"
	write := func(path, body string) {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write(filepath.Join(root, LockFile), `{"lockfileVersion":1,"sdks":{"`+name+`":{"range":"^1.4.0","version":"1.4.2","integrity":"sha512-AAAA"}}}`)
	dir := Dir(root, name, "1.4.2")
	write(filepath.Join(dir, "manifest.json"), `{"name":"`+name+`","version":"1.4.2"}`)

	lock, err := ReadLock(root)
	if err != nil {
		t.Fatal(err)
	}
	if _, reason := Check(root, name, "^1.4.0", lock); reason == "" {
		t.Error("an SDK with no integrity marker should not match")
	}
	write(filepath.Join(dir, IntegrityMarker), "sha512-AAAA")
	if got, reason := Check(root, name, "^1.4.0", lock); reason != "" || got != dir {
		t.Errorf("Check = %q, %q", got, reason)
	}
	if _, reason := Check(root, name, "^1.6.0", lock); reason == "" {
		t.Error("a range the lock was not written for should not match")
	}
	write(filepath.Join(dir, IntegrityMarker), "sha512-BBBB")
	if _, reason := Check(root, name, "^1.4.0", lock); reason == "" {
		t.Error("a different tarball should not match")
	}
}
