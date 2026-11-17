package visit

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

type listConfigTypes struct {
	input  *checker.Type
	output *checker.Type
}

// resolveListConfig reads the ListInput<F, S> and ListOutput<Row> a
// pikkuListFunc call resolves to off the config type of its resolved
// signature, so inferred and explicit generics agree.
func (s *Context) resolveListConfig(call *ast.Node) *listConfigTypes {
	sig := s.Checker.GetResolvedSignature(call)
	if sig == nil {
		return nil
	}
	config := s.Checker.GetReturnTypeOfSignature(sig)
	if config == nil {
		return nil
	}
	var args []*checker.Type
	if a := config.Alias(); a != nil {
		args = a.TypeArguments()
	}
	if len(args) == 0 && config.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		args = s.Checker.GetTypeArguments(config)
	}
	if len(args) == 0 || args[0] == nil {
		return nil
	}
	if sym := args[0].Symbol(); sym == nil || sym.Name != "ListInput" {
		return nil
	}
	out := &listConfigTypes{input: args[0]}
	if len(args) > 1 {
		out.output = args[1]
	}
	return out
}

func (s *Context) listInputArgs(input *checker.Type) (filter, sort *checker.Type) {
	if input.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		args := s.Checker.GetTypeArguments(input)
		if len(args) > 0 {
			filter = args[0]
		}
		if len(args) > 1 {
			sort = args[1]
		}
		return
	}
	if a := input.Alias(); a != nil {
		args := a.TypeArguments()
		if len(args) > 0 {
			filter = args[0]
		}
		if len(args) > 1 {
			sort = args[1]
		}
	}
	return
}

func isNamedType(t *checker.Type) bool {
	sym := t.Symbol()
	if a := t.Alias(); a != nil && a.Symbol() != nil {
		sym = a.Symbol()
	}
	return sym != nil && sym.Name != ast.InternalSymbolNameType && sym.Name != ast.InternalSymbolNameObject
}

// registerListInput records the custom types of a list function's input and
// returns the name of the input alias. The input is ListInput<F, S> with an
// anonymous F named <Name>Filter and a declared S named <Name>SortColumn; with
// no sort columns declared the input drops `sort`.
func (s *Context) registerListInput(capitalized string, list *listConfigTypes) (name string, listInput *checker.Type) {
	tm := s.TypesMap()
	filter, sort := s.listInputArgs(list.input)
	filterNamed := filter != nil && isNamedType(filter)
	filterName := capitalized + "Filter"
	if filter != nil && !filterNamed {
		tm.AddCustomType(filterName, s.typeToString(filter), tsutil.Dedupe(s.resolveTypeImports(filter, true)))
	}
	declaresSort := sort != nil && sort.Flags()&checker.TypeFlagsNever == 0
	sortName := capitalized + "SortColumn"
	if declaresSort {
		tm.AddCustomType(sortName, s.typeToString(sort), nil)
	}
	filterText := "{}"
	if filter != nil {
		if filterNamed {
			filterText = s.typeToString(filter)
		} else {
			filterText = filterName
		}
	}
	sortText := "never"
	if declaresSort {
		sortText = sortName
	}
	listInputText := "ListInput<" + filterText + ", " + sortText + ">"
	if !declaresSort {
		listInputText = "Omit<" + listInputText + ", 'sort'>"
	}
	name = capitalized + "Input"
	tm.AddCustomType(name, listInputText, tsutil.Dedupe(s.resolveTypeImports(list.input, true)))
	return name, list.input
}

// listRow is the Row of a ListOutput<Row>.
func (s *Context) listRow(output *checker.Type) *checker.Type {
	if output.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		if args := s.Checker.GetTypeArguments(output); len(args) > 0 {
			return args[0]
		}
	}
	if a := output.Alias(); a != nil && len(a.TypeArguments()) > 0 {
		return a.TypeArguments()[0]
	}
	return output
}
