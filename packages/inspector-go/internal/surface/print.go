package surface

import (
	"regexp"
	"sort"
	"strconv"
	"strings"

	"golang.org/x/text/collate"
	"golang.org/x/text/language"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/sourcescan"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

const signatureFlags = checker.TypeFormatFlagsNoTruncation |
	checker.TypeFormatFlagsUseAliasDefinedOutsideCurrentScope |
	checker.TypeFormatFlagsWriteTypeArgumentsOfSignature

const expandedFlags = signatureFlags &^ checker.TypeFormatFlagsUseAliasDefinedOutsideCurrentScope

// inlineLimit is INLINE_LIMIT: the widest an expanded type may print before
// its name is the better answer.
const inlineLimit = 72

var notTerminal = regexp.MustCompile(`[{}]|=>`)

func (s *session) typeToString(t *checker.Type, location *ast.Node, flags checker.TypeFormatFlags) string {
	return doubleQuoteLiterals(s.c.TypeToStringEx(t, location, flags, nil))
}

func (s *session) printType(t *checker.Type, location *ast.Node) string {
	return collapseWhitespace(s.typeToString(t, location, signatureFlags))
}

func collapse(constituents []string) []string {
	has := func(v string) bool {
		for _, c := range constituents {
			if c == v {
				return true
			}
		}
		return false
	}
	collapsed := constituents
	if has("true") && has("false") {
		collapsed = []string{"boolean"}
		for _, c := range constituents {
			if c != "true" && c != "false" {
				collapsed = append(collapsed, c)
			}
		}
	}
	isAbsent := func(c string) bool { return c == "undefined" || c == "null" }
	var present, absent []string
	for _, c := range collapsed {
		if isAbsent(c) {
			absent = append(absent, c)
		} else {
			present = append(present, c)
		}
	}
	return append(present, absent...)
}

// jsLength is String.prototype.length: UTF-16 code units.
func jsLength(s string) int {
	n := 0
	for _, r := range s {
		if r >= 0x10000 {
			n += 2
		} else {
			n++
		}
	}
	return n
}

func (s *session) printResolved(t *checker.Type, location *ast.Node, optional bool) string {
	if t.Flags()&checker.TypeFlagsTypeParameter != 0 {
		if constraint := s.c.GetBaseConstraintOfType(t); constraint != nil {
			return s.printResolved(constraint, location, optional)
		}
	}
	named := s.printType(t, location)
	var expanded string
	if t.IsUnion() {
		parts := make([]string, 0, len(t.Types()))
		for _, constituent := range t.Types() {
			parts = append(parts, s.typeToString(constituent, location, expandedFlags))
		}
		expanded = strings.Join(collapse(parts), " | ")
	} else {
		expanded = collapseWhitespace(s.typeToString(t, location, expandedFlags))
	}
	shed := func(v string) string {
		if optional {
			return strings.TrimSuffix(v, " | undefined")
		}
		return v
	}
	if expanded == named || jsLength(expanded) > inlineLimit {
		return shed(named)
	}
	if notTerminal.MatchString(expanded) {
		return shed(named)
	}
	return shed(expanded)
}

func (s *session) parameterType(parameter *ast.Symbol) (*checker.Type, *ast.Node) {
	decl := parameter.ValueDeclaration
	if decl != nil {
		return s.c.GetTypeOfSymbolAtLocation(parameter, decl), decl
	}
	return s.c.GetTypeOfSymbol(parameter), nil
}

func (s *session) constructorSignature(name string, t *checker.Type) string {
	signatures := s.c.GetSignaturesOfType(t, checker.SignatureKindConstruct)
	if len(signatures) == 0 {
		return ""
	}
	printed := make([]string, len(signatures))
	for i, signature := range signatures {
		params := make([]string, 0, len(signature.Parameters()))
		for _, parameter := range signature.Parameters() {
			pt, decl := s.parameterType(parameter)
			optional := decl != nil && decl.Kind == ast.KindParameter && decl.AsParameterDeclaration().QuestionToken != nil
			mark := ""
			if optional {
				mark = "?"
			}
			params = append(params, tsutil.SymbolName(parameter)+mark+": "+s.printResolved(pt, decl, optional))
		}
		printed[i] = "new " + name + "(" + strings.Join(params, ", ") + ")"
	}
	return strings.Join(printed, " | ")
}

func (s *session) signatureOf(name string, t *checker.Type, kind string, location *ast.Node) string {
	var printed string
	if kind == "class" {
		printed = s.constructorSignature(name, t)
	} else {
		printed = s.printType(t, location)
	}
	if printed == "" || printed == "any" || printed == "error" || printed == name {
		return ""
	}
	return collapseRuns(printed)
}

var literalRun = regexp.MustCompile(`("[^"]*"(?: \| "[^"]*"){7,})`)

// collapseRuns replaces a run of eight or more string literals, a union the
// project parameterises, with its count.
func collapseRuns(line string) string {
	return literalRun.ReplaceAllStringFunc(line, func(run string) string {
		return strconv.Itoa(len(strings.Split(run, " | "))) + " names (pikku meta)"
	})
}

func (s *session) isProjectOwned(decl *ast.Node) bool {
	sf := ast.GetSourceFileOfNode(decl)
	if sf == nil {
		return false
	}
	file := sf.FileName()
	return strings.HasPrefix(file, s.root) && !strings.Contains(file, "node_modules")
}

func (s *session) memberLine(property *ast.Symbol) *Member {
	name := tsutil.SymbolName(property)
	if strings.HasPrefix(name, "__") {
		return nil
	}
	decl := property.ValueDeclaration
	if decl == nil {
		decl = firstDecl(property)
	}
	if decl != nil {
		if sf := ast.GetSourceFileOfNode(decl); sf != nil && s.prog.IsSourceFileDefaultLibrary(sf.Path()) {
			return nil
		}
		if s.isProjectOwned(decl) {
			return nil
		}
	}
	var t *checker.Type
	if decl != nil {
		t = s.c.GetTypeOfSymbolAtLocation(property, decl)
	} else {
		t = s.c.GetTypeOfSymbol(property)
	}
	optional := property.Flags&ast.SymbolFlagsOptional != 0
	mark := ""
	if optional {
		mark = "?"
	}
	doc := sourcescan.JSTrim(collapseWhitespace(documentationComment(property, s.c, nil)))
	return &Member{
		Line: collapseRuns(name + mark + ": " + s.printResolved(t, decl, optional)),
		Doc:  doc,
	}
}

func (s *session) shapeOf(t *checker.Type, kind string) *checker.Type {
	if kind == "class" {
		signatures := s.c.GetSignaturesOfType(t, checker.SignatureKindConstruct)
		if len(signatures) == 0 {
			return nil
		}
		return s.c.GetReturnTypeOfSignature(signatures[0])
	}
	if kind != "function" && kind != "const" {
		return t
	}
	signatures := s.c.GetSignaturesOfType(t, checker.SignatureKindCall)
	if len(signatures) == 0 {
		return t
	}
	for _, parameter := range signatures[0].Parameters() {
		pt, _ := s.parameterType(parameter)
		if len(s.c.GetPropertiesOfType(pt)) > 0 {
			return pt
		}
	}
	return nil
}

var localeCollator = collate.New(language.English)

// localeCompare stands in for String.prototype.localeCompare under Node's
// default ICU locale.
func localeCompare(a, b string) int { return localeCollator.CompareString(a, b) }

func (s *session) membersOf(t *checker.Type, kind string) []Member {
	shape := s.shapeOf(t, kind)
	if shape == nil {
		return nil
	}
	var members []Member
	for _, property := range s.c.GetPropertiesOfType(shape) {
		if m := s.memberLine(property); m != nil {
			members = append(members, *m)
		}
	}
	sort.SliceStable(members, func(i, j int) bool { return localeCompare(members[i].Line, members[j].Line) < 0 })
	return members
}
