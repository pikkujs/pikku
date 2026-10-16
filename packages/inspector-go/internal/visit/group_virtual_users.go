package visit

import (
	"slices"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-virtual-users.ts.

func init() {
	Register(Visitor{Name: "addVirtualUsers", Phase: PhaseRoutes, Order: OrderAddVirtualUsers, Visit: (*Context).addVirtualUsers})
}

// virtualUserDispositions is Object.keys(DISPOSITIONS) from
// @pikku/core/virtual-user (virtual-user-dispositions.ts), in its order.
var virtualUserDispositions = []string{"realistic", "careless", "newcomer", "stale", "auditor", "adversarial", "accountable"}

var virtualUserRates = []struct {
	name     string
	min, max float64
}{
	{"temperature", 0, 2},
	{"repeatRate", 0, 1},
	{"reReadRate", 0, 1},
}

// claimSingleDeclaration ports utils/single-declaration.ts.
func (s *Context) claimSingleDeclaration(files *state.Set, code diag.Code, helper, sourceFile string) bool {
	if strings.HasSuffix(sourceFile, ".gen.ts") {
		return true
	}
	if files.Len() == 0 {
		files.Add(sourceFile)
		return true
	}
	first := files.Values()[0]
	msg := "Only one " + helper + "(...) is allowed per codebase, so there is one place to read the declarations from and one place to add to. "
	if first == sourceFile {
		msg += "Found a second call in " + sourceFile + ". Declare them all in one call."
	} else {
		msg += "Found a second in " + sourceFile + " (first: " + first + "). Declare them all in one call."
	}
	s.Log.Critical(code, msg)
	return false
}

// virtualUserTuning is tuningProperty; nil when nothing was read.
func virtualUserTuning(config *ast.Node, onError func(string)) *jsObject {
	value := tsutil.LiteralProperty(config, "tuning")
	if value == nil || !ast.IsObjectLiteralExpression(value) {
		return nil
	}
	tuning := &jsObject{}

	if movesValue := tsutil.LiteralProperty(value, "moves"); movesValue != nil && ast.IsObjectLiteralExpression(movesValue) {
		var moves jsObject
		for _, move := range []string{"continue", "suspend", "resume", "abandon"} {
			weight, ok := tsutil.LiteralNumber(movesValue, move)
			if !ok {
				continue
			}
			if weight < 0 {
				onError("tuning.moves." + move + " must not be negative (got " + tsutil.JSNumberString(weight) + ").")
				continue
			}
			moves.set(move, weight)
		}
		if moves.rec.Len() > 0 {
			tuning.set("moves", &moves.rec)
		}
	}

	for _, r := range virtualUserRates {
		rate, ok := tsutil.LiteralNumber(value, r.name)
		if !ok {
			continue
		}
		if rate < r.min || rate > r.max {
			onError("tuning." + r.name + " must be between " + tsutil.JSNumberString(r.min) + " and " +
				tsutil.JSNumberString(r.max) + " (got " + tsutil.JSNumberString(rate) + ").")
			continue
		}
		tuning.set(r.name, rate)
	}

	for _, flag := range []string{"emptyMemory", "readOnly", "invertedOracle"} {
		if v, ok := tsutil.LiteralBool(value, flag); ok {
			tuning.set(flag, v)
		}
	}
	if v, ok := tsutil.LiteralString(value, "instructions"); ok {
		tuning.set("instructions", v)
	}
	if tuning.rec.Len() == 0 {
		return nil
	}
	return tuning
}

// virtualUserAccount is accountProperty: nil when value is not an object
// literal, `{}` or `{ provider }` otherwise.
func virtualUserAccount(value *ast.Node) *jsObject {
	if value == nil || !ast.IsObjectLiteralExpression(value) {
		return nil
	}
	account := &jsObject{}
	if provider, ok := tsutil.LiteralString(value, "provider"); ok {
		account.set("provider", provider)
	}
	return account
}

func (s *Context) virtualUserLinkedAccounts(config *ast.Node, id string) *state.Record[state.Raw] {
	value := tsutil.LiteralProperty(config, "linkedAccounts")
	if value == nil || !ast.IsObjectLiteralExpression(value) {
		return nil
	}
	accounts := state.NewRecord[state.Raw]()
	for _, prop := range value.Properties() {
		if !ast.IsPropertyAssignment(prop) {
			continue
		}
		key, ok := literalKeyName(prop.Name())
		if !ok {
			s.Log.Critical(diag.NonLiteralWireName, "VirtualUser '"+id+"' has a linked account whose key is not a literal.")
			continue
		}
		account := virtualUserAccount(prop.Initializer())
		if account == nil {
			s.Log.Critical(diag.InvalidValue, "VirtualUser '"+id+"' linked account '"+key+"' must be an object literal.")
			continue
		}
		accounts.Set(key, account.raw())
	}
	if accounts.Len() == 0 {
		return nil
	}
	return accounts
}

func literalStringsOr(config *ast.Node, name string, def state.Strings) state.Strings {
	if v, ok := tsutil.LiteralStringArray(config, name); ok {
		return v
	}
	return def
}

func (s *Context) addVirtualUsers(node *ast.Node) {
	if !ast.IsCallExpression(node) {
		return
	}
	expr := node.Expression()
	if !ast.IsIdentifier(expr) || expr.Text() != "defineVirtualUsers" {
		return
	}
	args := node.Arguments()
	if len(args) == 0 {
		return
	}
	obj := tsutil.UnwrapAs(args[0])
	if !ast.IsObjectLiteralExpression(obj) {
		s.Log.Critical(diag.InvalidValue, "defineVirtualUsers() needs an inline object — virtual users are read statically, never evaluated.")
		return
	}
	sourceFile := ast.GetSourceFileOfNode(node).FileName()
	if !s.claimSingleDeclaration(&s.State.VirtualUsers.Files, diag.DuplicateVirtualUsersDefinition, "defineVirtualUsers", sourceFile) {
		return
	}

	for _, prop := range obj.Properties() {
		if !ast.IsPropertyAssignment(prop) {
			continue
		}
		id, ok := literalKeyName(prop.Name())
		if !ok {
			s.Log.Critical(diag.NonLiteralWireName, "A virtual user is declared with a key that is not a literal.")
			continue
		}
		config := prop.Initializer()
		if !ast.IsObjectLiteralExpression(config) {
			s.Log.Critical(diag.InvalidValue, "VirtualUser '"+id+"' must be an object literal.")
			continue
		}
		name, _ := tsutil.LiteralString(config, "name")
		if name == "" {
			s.Log.Critical(diag.InvalidValue, "VirtualUser '"+id+"' needs a literal 'name' — a virtual user is a person, and the console has nothing to show without one.")
			continue
		}
		disposition, hasDisposition := tsutil.LiteralString(config, "disposition")
		if hasDisposition && !slices.Contains(virtualUserDispositions, disposition) {
			s.Log.Critical(diag.InvalidValue, "VirtualUser '"+id+"' has an unknown disposition '"+disposition+"'. One of: "+
				strings.Join(virtualUserDispositions, ", "))
			continue
		}

		tuningFailed := false
		tuning := virtualUserTuning(config, func(message string) {
			tuningFailed = true
			s.Log.Critical(diag.InvalidValue, "VirtualUser '"+id+"': "+message)
		})
		if tuningFailed {
			continue
		}

		account := virtualUserAccount(tsutil.LiteralProperty(config, "account"))
		declaredRunnable, hasRunnable := tsutil.LiteralBool(config, "runnable")
		// isRunnableVirtualUser: an explicit `runnable: false` wins, and a
		// provider login cannot be driven.
		runnable := !(hasRunnable && !declaredRunnable)
		if runnable && account != nil && account.rec.Has("provider") {
			runnable = false
		}

		var vu jsObject
		vu.set("id", id)
		vu.set("name", name)
		vu.set("roles", literalStringsOr(config, "roles", state.Strings{}))
		vu.set("goals", literalStringsOr(config, "goals", state.Strings{}))
		vu.set("tags", literalStringsOr(config, "tags", state.Strings{}))
		vu.set("runnable", runnable)
		vu.set("sourceFile", sourceFile)
		for _, field := range []string{"jobTitle", "description", "avatarUrl", "personality", "app"} {
			if v, ok := tsutil.LiteralString(config, field); ok {
				vu.set(field, v)
			}
		}
		if hasDisposition {
			vu.set("disposition", disposition)
		}
		if tuning != nil {
			vu.set("tuning", &tuning.rec)
		}
		if v, ok := tsutil.LiteralStringArray(config, "fixtures"); ok {
			vu.set("fixtures", state.Strings(v))
		}
		if v, ok := tsutil.LiteralStringArray(config, "environments"); ok {
			vu.set("environments", state.Strings(v))
		}
		if account != nil {
			vu.set("account", &account.rec)
		}
		if linked := s.virtualUserLinkedAccounts(config, id); linked != nil {
			vu.set("linkedAccounts", linked)
		}
		s.State.VirtualUsers.Definitions = append(s.State.VirtualUsers.Definitions, vu.raw())
	}
}
