//! Port of Go `visit/util_types.go`: the type-naming half of add-functions.ts.
//! The TypesMap unique-name machinery is not ported: a non-custom type is always
//! recorded under its own symbol name, which is what TypesMap.addType does
//! unless an earlier addUniqueType claimed the name with a different path.

use tsrs_ast::{self as ast, Kind, Symbol, INTERNAL_SYMBOL_NAME_TYPE};
use tsrs_checker::{ObjectFlags, Type, TypeFlags, TypeFormatFlags};
use tsrs_core::P;

use super::Context;
use crate::tsutil::{self, file_name_of, first_decl};

/// Go `validVarName`: `^[a-zA-Z_$][a-zA-Z0-9_$]*$`.
pub fn is_valid_var_name(s: &str) -> bool {
    let mut cs = s.chars();
    match cs.next() {
        Some(c) if c.is_ascii_alphabetic() || c == '_' || c == '$' => {}
        _ => return false,
    }
    cs.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
}

impl Context<'_> {
    /// `typeToString` with `NoTruncation` and Strada's union order.
    pub fn type_to_string(&mut self, t: P<Type>) -> String {
        tsutil::unionorder::type_to_string(self.checker, t, TypeFormatFlags::NoTruncation)
    }

    fn is_promise_sym(&mut self, t: P<Type>) -> bool {
        let Some(sym) = t.symbol() else { return false };
        sym.name() == "Promise" && self.checker.get_fully_qualified_name_exported(sym).contains("Promise")
    }

    /// `unwrapPromise`.
    pub fn unwrap_promise(&mut self, t: P<Type>) -> P<Type> {
        if t.symbol().is_none() {
            return t;
        }
        if !self.is_promise_sym(t) {
            return t;
        }
        if let Some(a) = t.alias() {
            if a.type_arguments().len() == 1 {
                return a.type_arguments()[0];
            }
        }
        if t.object_flags().intersects(ObjectFlags::Reference) {
            let args = self.checker.get_type_arguments_exported(t);
            if args.len() == 1 {
                return args[0];
            }
        }
        t
    }

    fn visit_nested(&mut self, cur: P<Type>, is_custom: bool, out: &mut Vec<String>) {
        if let Some(a) = cur.alias() {
            for ta in a.type_arguments() {
                self.resolve_type_imports_visit(*ta, is_custom, out);
            }
        }
        if cur.flags().intersects(TypeFlags::UnionOrIntersection) {
            for m in cur.types() {
                self.resolve_type_imports_visit(*m, is_custom, out);
            }
        }
        if cur.flags().intersects(TypeFlags::Object) && cur.object_flags().intersects(ObjectFlags::Reference) {
            for ta in self.checker.get_type_arguments_exported(cur) {
                self.resolve_type_imports_visit(*ta, is_custom, out);
            }
        }
    }

    fn resolve_type_imports_visit(&mut self, cur: P<Type>, is_custom: bool, out: &mut Vec<String>) {
        let mut sym: Option<P<Symbol>> = cur.alias().and_then(|a| a.symbol());
        if sym.is_none() {
            sym = cur.symbol();
        }
        if let Some(decl) = first_decl(sym) {
            let sym = sym.unwrap();
            let path = file_name_of(decl);
            let name = tsutil::symbol_name(sym);
            if !tsutil::is_lib_file(path)
                && sym.name() != INTERNAL_SYMBOL_NAME_TYPE
                && !tsutil::is_primitive(cur)
                && decl.kind() != Kind::EnumMember
            {
                let tm = self.types_map();
                let mut unique = tm.exists(&name, path).map(str::to_string).unwrap_or_default();
                if unique.is_empty() {
                    if is_custom {
                        unique = tm.add_unique_type(&name, path);
                    } else {
                        tm.add_type(&name, path);
                        unique = name;
                    }
                }
                out.push(unique);
            }
        }
        // TS walks the nested types twice for a custom alias (once in its
        // isCustom branch, once unconditionally), so references can repeat.
        if is_custom {
            self.visit_nested(cur, is_custom, out);
        }
        self.visit_nested(cur, is_custom, out);
        if cur.flags().intersects(TypeFlags::Object) {
            let ts = cur.symbol();
            if ts.is_none() || ts.is_some_and(|s| s.name() == INTERNAL_SYMBOL_NAME_TYPE) {
                for prop in self.checker.get_properties_of_type_exported(cur) {
                    if let Some(vd) = prop.value_declaration() {
                        if let Some(pt) = self.checker.get_type_of_symbol_at_location(*prop, Some(vd)) {
                            self.resolve_type_imports_visit(pt, is_custom, out);
                        }
                    }
                }
            }
        }
    }

    /// `resolveTypeImports`.
    pub fn resolve_type_imports(&mut self, t: P<Type>, is_custom: bool) -> Vec<String> {
        let mut out = Vec::new();
        self.resolve_type_imports_visit(t, is_custom, &mut out);
        out
    }

    /// `getNamesAndTypes`.
    pub fn get_names_and_types(&mut self, direction: &str, func_name: &str, t: Option<P<Type>>) -> (Vec<String>, Vec<P<Type>>) {
        let Some(t) = t else { return (vec![], vec![]) };
        if t.flags().intersects(TypeFlags::VoidLike | TypeFlags::Null) {
            return (vec![], vec![]);
        }
        let mut types: Vec<P<Type>> = Vec::new();
        let mut names: Vec<String> = Vec::new();
        let mut add = |this: &mut Self, m: P<Type>| {
            let s = this.type_to_string(m);
            let n = tsutil::nullify_type(&s);
            if !n.is_empty() {
                types.push(m);
                names.push(n.to_string());
            }
        };
        if t.is_union() && !t.flags().intersects(TypeFlags::Intersection) {
            for m in tsutil::typeorder::union_types_in_id_order(t) {
                add(self, m);
            }
        } else {
            add(self, t);
        }
        if names.len() > 1 || (names.len() == 1 && !is_valid_var_name(&names[0])) {
            let alias_name = format!("{}{}", tsutil::func_id_to_type_name(func_name), direction);
            let mut refs: Vec<String> = Vec::new();
            for rt in &types {
                refs.extend(self.resolve_type_imports(*rt, true));
            }
            self.types_map().add_custom_type(&alias_name, &names.join(" | "), refs);
            return (vec![alias_name], types);
        }
        let mut out = Vec::new();
        for (i, n) in names.iter().enumerate() {
            if tsutil::is_primitive(types[i]) {
                out.push(n.clone());
            } else {
                out.extend(self.resolve_type_imports(types[i], false));
            }
        }
        (out, types)
    }

    // --- ensure-function-metadata.ts flavour of the same helpers ----------

    fn first_type_arg(&mut self, t: P<Type>) -> Option<P<Type>> {
        if let Some(a) = t.alias() {
            if !a.type_arguments().is_empty() {
                return Some(a.type_arguments()[0]);
            }
        }
        if t.object_flags().intersects(ObjectFlags::Reference) {
            let args = self.checker.get_type_arguments_exported(t);
            if !args.is_empty() {
                return Some(args[0]);
            }
        }
        None
    }

    /// `unwrapPromiseOrVoid` also drops `void` / `Promise<void>` members of a union.
    pub fn unwrap_promise_or_void(&mut self, t: P<Type>) -> P<Type> {
        if t.is_union() {
            let mut non_void = Vec::new();
            for m in t.types() {
                if tsutil::is_void_like_type(*m) {
                    continue;
                }
                if self.is_promise_sym(*m) {
                    if let Some(inner) = self.first_type_arg(*m) {
                        if tsutil::is_void_like_type(inner) {
                            continue;
                        }
                    }
                }
                non_void.push(*m);
            }
            if !non_void.is_empty() {
                return self.unwrap_promise_or_void(non_void[0]);
            }
            return t;
        }
        self.unwrap_promise(t)
    }

    /// `resolveTypeName`.
    pub fn resolve_type_name(&mut self, t: P<Type>, func_name: &str, direction: &str) -> String {
        if t.flags().intersects(TypeFlags::VoidLike | TypeFlags::Null) {
            return String::new();
        }
        let s = self.type_to_string(t);
        if s.is_empty() || s == "void" || s == "undefined" || s == "null" {
            return String::new();
        }
        if is_valid_var_name(&s) {
            let sym = t.alias().and_then(|a| a.symbol()).or_else(|| t.symbol());
            if let Some(decl) = first_decl(sym) {
                let path = file_name_of(decl);
                let tm = self.types_map();
                if tm.exists(&s, path).is_none() {
                    tm.add_type(&s, path);
                }
            }
            return s;
        }
        let alias = format!("{}{}", tsutil::func_id_to_type_name(func_name), direction);
        self.types_map().add_custom_type(&alias, &s, Vec::new());
        alias
    }
}

#[allow(dead_code)]
fn _k(_: fn(tsrs_core::P<tsrs_ast::Node>) -> bool) {
    let _ = ast::is_identifier;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn var_names() {
        assert!(is_valid_var_name("Foo"));
        assert!(is_valid_var_name("$a_1"));
        assert!(!is_valid_var_name("1a"));
        assert!(!is_valid_var_name("A | B"));
        assert!(!is_valid_var_name("a.b"));
        assert!(!is_valid_var_name(""));
    }
}
