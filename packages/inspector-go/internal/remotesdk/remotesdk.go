// Package remotesdk ports utils/remote-addon-sdk.ts: the versioned
// wireRemoteAddon package spec, pikku-addons.lock and the SDKs
// `pikku all` extracts under .pikku/remote.
package remotesdk

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	LockFile        = "pikku-addons.lock"
	IntegrityMarker = ".integrity"
)

// SdkRoot is REMOTE_SDK_DIR, relative to the project root.
var SdkRoot = filepath.Join(".pikku", "remote")

// ParsePackage is parseRemoteAddonPackage: split at the last '@' after the
// first character. rng is "" when the spec names only the package.
func ParsePackage(spec string) (name, rng string, err error) {
	trimmed := strings.TrimSpace(spec)
	at := strings.LastIndex(trimmed, "@")
	if at <= 0 {
		if trimmed == "" || trimmed == "@" {
			return "", "", fmt.Errorf("'%s' is not a package name", spec)
		}
		return trimmed, "", nil
	}
	name = trimmed[:at]
	rng = strings.TrimSpace(trimmed[at+1:])
	if rng == "" {
		return "", "", fmt.Errorf("'%s' ends in '@' with no version range after it. Write '%s@^1.0.0', or drop the '@'.", spec, name)
	}
	return name, rng, nil
}

type LockEntry struct {
	Range     string `json:"range"`
	Version   string `json:"version"`
	Integrity string `json:"integrity"`
}

type Lock struct {
	Sdks map[string]LockEntry `json:"sdks"`
}

// ReadLock is readAddonsLock: an empty lock when the file is absent.
func ReadLock(rootDir string) (*Lock, error) {
	path := filepath.Join(rootDir, LockFile)
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return &Lock{Sdks: map[string]LockEntry{}}, nil
	}
	if err != nil {
		return nil, err
	}
	var raw struct {
		Sdks *map[string]LockEntry `json:"sdks"`
	}
	if err := json.Unmarshal(b, &raw); err != nil {
		return nil, fmt.Errorf("%s is not valid JSON: %s", path, err.Error())
	}
	if raw.Sdks == nil {
		return nil, fmt.Errorf("%s has no \"sdks\" object", path)
	}
	return &Lock{Sdks: *raw.Sdks}, nil
}

func Dir(rootDir, name, version string) string {
	return filepath.Join(rootDir, SdkRoot, name+"@"+version)
}

// Check is checkLockedSdk: "" and the SDK directory when the SDK on disk is
// the one the lock pins for this range, else the reason it is not.
func Check(rootDir, name, rng string, lock *Lock) (dir string, reason string) {
	entry, ok := lock.Sdks[name]
	if !ok {
		return "", LockFile + " has no entry for it"
	}
	if entry.Range != rng {
		return "", fmt.Sprintf("%s was resolved for '%s', not '%s'", LockFile, entry.Range, rng)
	}
	dir = Dir(rootDir, name, entry.Version)
	marker, err := os.ReadFile(filepath.Join(dir, IntegrityMarker))
	if err != nil {
		return "", dir + " is missing"
	}
	if strings.TrimSpace(string(marker)) != entry.Integrity {
		return "", fmt.Sprintf("%s was extracted from a different tarball than %s pins", dir, LockFile)
	}
	var manifest struct {
		Name    string `json:"name"`
		Version string `json:"version"`
	}
	b, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	if err != nil || json.Unmarshal(b, &manifest) != nil || manifest.Name != name || manifest.Version != entry.Version {
		return "", fmt.Sprintf("%s/manifest.json does not name %s@%s", dir, name, entry.Version)
	}
	return dir, ""
}
