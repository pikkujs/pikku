package tsutil

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

func NullifyType(name string) string {
	switch name {
	case "void", "undefined", "unknown", "any", "null":
		return ""
	}
	return name
}

const PrimitiveFlags = checker.TypeFlagsNumber | checker.TypeFlagsString | checker.TypeFlagsBoolean |
	checker.TypeFlagsBigInt | checker.TypeFlagsESSymbol | checker.TypeFlagsVoid | checker.TypeFlagsUndefined |
	checker.TypeFlagsNull | checker.TypeFlagsUnknown | checker.TypeFlagsVoidLike

func IsPrimitive(t *checker.Type) bool { return t.Flags()&PrimitiveFlags != 0 }

func IsLibFile(path string) bool {
	// TS checks for node_modules/typescript; typescript-go serves its lib
	// files from an embedded "bundled:///libs/..." filesystem instead.
	return strings.Contains(path, "node_modules/typescript") || strings.HasPrefix(path, "bundled:")
}

func IsVoidLikeType(t *checker.Type) bool {
	return t.Flags()&(checker.TypeFlagsVoid|checker.TypeFlagsUndefined|checker.TypeFlagsVoidLike) != 0
}

// SymbolName spells internal symbol names the way Strada does: tsgo marks
// them with a 0xFE byte ("\xFEobject"), TS with a "__" prefix ("__object").
func SymbolName(sym *ast.Symbol) string {
	if strings.HasPrefix(sym.Name, "\xFE") {
		return "__" + sym.Name[1:]
	}
	return sym.Name
}
