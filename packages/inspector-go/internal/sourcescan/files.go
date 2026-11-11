package sourcescan

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
)

var skipDirs = map[string]bool{
	"node_modules": true, ".git": true, ".pikku": true, "dist": true,
	"build": true, ".next": true, ".output": true, ".yarn": true, "paraglide": true,
}

var tsFileRe = regexp.MustCompile(`\.tsx?$`)

// SourceFiles ports verify/source-checks.ts sourceFiles: every .ts/.tsx file
// under dir, skipping vendor and generated directories.
func SourceFiles(dir string, includeGenerated, skipHidden bool) []string {
	files := []string{}
	var walk func(current string, depth int)
	walk = func(current string, depth int) {
		if depth > 12 {
			return
		}
		entries, err := os.ReadDir(current)
		if err != nil {
			return
		}
		sort.SliceStable(entries, func(i, j int) bool {
			return compareUTF16(entries[i].Name(), entries[j].Name()) < 0
		})
		for _, entry := range entries {
			name := entry.Name()
			full := filepath.Join(current, name)
			if entry.IsDir() {
				if !skipDirs[name] && !(skipHidden && strings.HasPrefix(name, ".")) {
					walk(full, depth+1)
				}
			} else if tsFileRe.MatchString(name) && !strings.HasSuffix(name, ".d.ts") &&
				(includeGenerated || !strings.Contains(name, ".gen.")) {
				files = append(files, full)
			}
		}
	}
	walk(dir, 0)
	return files
}

// compareUTF16 orders strings the way JavaScript's < does: by UTF-16 code unit.
func compareUTF16(a, b string) int {
	ua, ub := utf16.Encode([]rune(a)), utf16.Encode([]rune(b))
	for i := 0; i < len(ua) && i < len(ub); i++ {
		if ua[i] != ub[i] {
			if ua[i] < ub[i] {
				return -1
			}
			return 1
		}
	}
	return len(ua) - len(ub)
}

// ParsedSource is a parsed file; OK is false when the parser reported a
// syntax error.
type ParsedSource struct {
	SF   *ast.SourceFile
	Text string
	OK   bool
}

// ParseSource ports parseSource: nil when the file cannot be read.
func ParseSource(file string) *ParsedSource {
	b, err := os.ReadFile(file)
	if err != nil {
		return nil
	}
	text := decodeUTF8(b)
	sf := parseSourceText(file, text)
	return &ParsedSource{SF: sf, Text: text, OK: len(sf.Diagnostics()) == 0}
}

func parseSourceText(file, text string) *ast.SourceFile {
	kind := core.ScriptKindTS
	if strings.HasSuffix(file, ".tsx") {
		kind = core.ScriptKindTSX
	}
	return Parse(file, text, kind)
}

// sliceUTF16 is s.slice(0, n) for n UTF-16 code units.
func sliceUTF16(s string, n int) string {
	units := utf16.Encode([]rune(s))
	if len(units) <= n {
		return s
	}
	return string(utf16.Decode(units[:n]))
}

// decodeUTF8 is fs.readFileSync(file, 'utf8'): each maximal run of bytes that
// is the start of a UTF-8 sequence, or a lone invalid byte, becomes one U+FFFD.
func decodeUTF8(b []byte) string {
	if utf8.Valid(b) {
		return string(b)
	}
	var out strings.Builder
	for len(b) > 0 {
		r, size := utf8.DecodeRune(b)
		if r == utf8.RuneError && size <= 1 {
			out.WriteRune(utf8.RuneError)
			size = invalidRunLength(b)
		} else {
			out.Write(b[:size])
		}
		b = b[size:]
	}
	return out.String()
}

// invalidRunLength is the length of the maximal subpart of an ill-formed UTF-8
// sequence at the start of b.
func invalidRunLength(b []byte) int {
	lead := b[0]
	var continuations int
	low, high := byte(0x80), byte(0xbf)
	switch {
	case lead >= 0xc2 && lead <= 0xdf:
		continuations = 1
	case lead == 0xe0:
		continuations, low = 2, 0xa0
	case lead == 0xed:
		continuations, high = 2, 0x9f
	case lead >= 0xe1 && lead <= 0xef:
		continuations = 2
	case lead == 0xf0:
		continuations, low = 3, 0x90
	case lead == 0xf4:
		continuations, high = 3, 0x8f
	case lead >= 0xf1 && lead <= 0xf3:
		continuations = 3
	default:
		return 1
	}
	length := 1
	for ; continuations > 0 && length < len(b) && b[length] >= low && b[length] <= high; continuations-- {
		length++
		low, high = 0x80, 0xbf
	}
	return length
}
