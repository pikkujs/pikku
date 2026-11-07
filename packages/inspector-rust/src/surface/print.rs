//! Port of `print.go`: signature and member printing.

use std::cmp::Ordering;
use std::sync::OnceLock;

use icu_collator::options::CollatorOptions;
use icu_collator::{Collator, CollatorBorrowed};
use regex::Regex;
use tsrs_ast::{Kind, Node, Symbol, SymbolFlags, get_source_file_of_node};
use tsrs_checker::{SignatureKind, Type, TypeFlags, TypeFormatFlags};
use tsrs_core::P;

use super::jsdoc::documentation_comment;
use super::quotes::double_quote_literals;
use super::{Member, Session, collapse_whitespace, first_decl};
use crate::sourcescan::js_trim;

fn signature_flags() -> TypeFormatFlags {
    TypeFormatFlags::NoTruncation
        | TypeFormatFlags::UseAliasDefinedOutsideCurrentScope
        | TypeFormatFlags::WriteTypeArgumentsOfSignature
}

fn expanded_flags() -> TypeFormatFlags {
    signature_flags() & !TypeFormatFlags::UseAliasDefinedOutsideCurrentScope
}

/// INLINE_LIMIT: the widest an expanded type may print before its name is the
/// better answer.
const INLINE_LIMIT: usize = 72;

fn not_terminal() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"[{}]|=>").unwrap())
}

pub fn symbol_name(sym: P<Symbol>) -> String {
    let name = sym.name();
    match name.strip_prefix(tsrs_ast::INTERNAL_SYMBOL_NAME_PREFIX) {
        Some(rest) => format!("__{rest}"),
        None => name.to_string(),
    }
}

fn collapse(constituents: Vec<String>) -> Vec<String> {
    let has = |v: &str| constituents.iter().any(|c| c == v);
    let mut collapsed = constituents.clone();
    if has("true") && has("false") {
        collapsed = vec!["boolean".to_string()];
        for c in &constituents {
            if c != "true" && c != "false" {
                collapsed.push(c.clone());
            }
        }
    }
    let is_absent = |c: &String| c == "undefined" || c == "null";
    let mut present: Vec<String> = collapsed.iter().filter(|c| !is_absent(c)).cloned().collect();
    let absent: Vec<String> = collapsed.iter().filter(|c| is_absent(c)).cloned().collect();
    present.extend(absent);
    present
}

fn js_length(s: &str) -> usize {
    s.encode_utf16().count()
}

impl Session<'_> {
    pub fn type_to_string(&mut self, t: P<Type>, location: Option<P<Node>>, flags: TypeFormatFlags) -> String {
        double_quote_literals(&self.c.type_to_string_ex_exported(t, location, flags, None))
    }

    pub fn print_type(&mut self, t: P<Type>, location: Option<P<Node>>) -> String {
        collapse_whitespace(&self.type_to_string(t, location, signature_flags()))
    }

    pub fn print_resolved(&mut self, t: P<Type>, location: Option<P<Node>>, optional: bool) -> String {
        if t.flags().intersects(TypeFlags::TypeParameter) {
            if let Some(constraint) = self.c.get_base_constraint_of_type_exported(t) {
                return self.print_resolved(constraint, location, optional);
            }
        }
        let named = self.print_type(t, location);
        let expanded;
        if t.is_union() {
            let mut parts = Vec::new();
            for constituent in t.types() {
                parts.push(self.type_to_string(*constituent, location, expanded_flags()));
            }
            expanded = collapse(parts).join(" | ");
        } else {
            expanded = collapse_whitespace(&self.type_to_string(t, location, expanded_flags()));
        }
        let shed = |v: &str| -> String {
            if optional { v.strip_suffix(" | undefined").unwrap_or(v).to_string() } else { v.to_string() }
        };
        if expanded == named || js_length(&expanded) > INLINE_LIMIT {
            return shed(&named);
        }
        if not_terminal().is_match(&expanded) {
            return shed(&named);
        }
        shed(&expanded)
    }

    pub fn parameter_type(&mut self, parameter: P<Symbol>) -> (P<Type>, Option<P<Node>>) {
        if let Some(decl) = parameter.value_declaration() {
            return (self.c.get_type_of_symbol_at_location(parameter, Some(decl)).unwrap(), Some(decl));
        }
        (self.c.get_type_of_symbol(parameter), None)
    }

    fn constructor_signature(&mut self, name: &str, t: P<Type>) -> String {
        let signatures = self.c.get_signatures_of_type_exported(t, SignatureKind::Construct);
        if signatures.is_empty() {
            return String::new();
        }
        let mut printed = Vec::new();
        for signature in signatures {
            let mut params = Vec::new();
            for parameter in signature.parameters() {
                let (pt, decl) = self.parameter_type(*parameter);
                let optional = decl.is_some_and(|d| d.kind() == Kind::Parameter && d.question_token().is_some());
                let mark = if optional { "?" } else { "" };
                params.push(format!("{}{}: {}", symbol_name(*parameter), mark, self.print_resolved(pt, decl, optional)));
            }
            printed.push(format!("new {}({})", name, params.join(", ")));
        }
        printed.join(" | ")
    }

    pub fn signature_of(&mut self, name: &str, t: P<Type>, kind: &str, location: Option<P<Node>>) -> String {
        let printed = if kind == "class" { self.constructor_signature(name, t) } else { self.print_type(t, location) };
        if printed.is_empty() || printed == "any" || printed == "error" || printed == name {
            return String::new();
        }
        collapse_runs(&printed)
    }

    fn is_project_owned(&self, decl: P<Node>) -> bool {
        let Some(sf) = get_source_file_of_node(decl) else { return false };
        let file = sf.file_name();
        file.starts_with(&self.root) && !file.contains("node_modules")
    }

    fn member_line(&mut self, property: P<Symbol>) -> Option<Member> {
        let name = symbol_name(property);
        if name.starts_with("__") {
            return None;
        }
        let decl = property.value_declaration().or_else(|| first_decl(Some(property)));
        if let Some(decl) = decl {
            if let Some(sf) = get_source_file_of_node(decl) {
                if self.prog.is_source_file_default_library(sf.path()) {
                    return None;
                }
            }
            if self.is_project_owned(decl) {
                return None;
            }
        }
        let t = match decl {
            Some(d) => self.c.get_type_of_symbol_at_location(property, Some(d)).unwrap(),
            None => self.c.get_type_of_symbol(property),
        };
        let optional = property.flags().intersects(SymbolFlags::Optional);
        let mark = if optional { "?" } else { "" };
        let doc_raw = documentation_comment(Some(property), Some(&mut self.c), &mut Default::default());
        let doc = js_trim(&collapse_whitespace(&doc_raw)).to_string();
        let resolved = self.print_resolved(t, decl, optional);
        Some(Member { line: collapse_runs(&format!("{name}{mark}: {resolved}")), doc })
    }

    fn shape_of(&mut self, t: P<Type>, kind: &str) -> Option<P<Type>> {
        if kind == "class" {
            let signatures = self.c.get_signatures_of_type_exported(t, SignatureKind::Construct);
            if signatures.is_empty() {
                return None;
            }
            return Some(self.c.get_return_type_of_signature_exported(signatures[0]));
        }
        if kind != "function" && kind != "const" {
            return Some(t);
        }
        let signatures = self.c.get_signatures_of_type_exported(t, SignatureKind::Call);
        if signatures.is_empty() {
            return Some(t);
        }
        for parameter in signatures[0].parameters() {
            let (pt, _) = self.parameter_type(*parameter);
            if !self.c.get_properties_of_type_exported(pt).is_empty() {
                return Some(pt);
            }
        }
        None
    }

    pub fn members_of(&mut self, t: P<Type>, kind: &str) -> Vec<Member> {
        let Some(shape) = self.shape_of(t, kind) else { return vec![] };
        let mut members = Vec::new();
        for property in self.c.get_properties_of_type_exported(shape) {
            if let Some(m) = self.member_line(*property) {
                members.push(m);
            }
        }
        members.sort_by(|a, b| locale_compare(&a.line, &b.line));
        members
    }
}

fn literal_run() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r#"("[^"]*"(?: \| "[^"]*"){7,})"#).unwrap())
}

/// Replaces a run of eight or more string literals, a union the project
/// parameterises, with its count.
pub fn collapse_runs(line: &str) -> String {
    literal_run()
        .replace_all(line, |caps: &regex::Captures| {
            format!("{} names (pikku meta)", caps[0].split(" | ").count())
        })
        .into_owned()
}

fn collator() -> &'static CollatorBorrowed<'static> {
    static C: OnceLock<CollatorBorrowed<'static>> = OnceLock::new();
    C.get_or_init(|| Collator::try_new(Default::default(), CollatorOptions::default()).expect("collator"))
}

/// Stands in for `String.prototype.localeCompare` under Node's default ICU locale.
pub fn locale_compare(a: &str, b: &str) -> Ordering {
    collator().compare(a, b)
}
