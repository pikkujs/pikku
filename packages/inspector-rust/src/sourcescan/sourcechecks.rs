//! Port of `sourcechecks.go`: the source scans of `verify/source-checks.ts`.

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use tsrs_ast::{
    Kind, Node, SourceFile, is_arrow_function, is_array_literal_expression, is_binary_expression,
    is_binding_element, is_call_expression, is_conditional_expression, is_decorator, is_element_access_expression,
    is_export_declaration, is_function_declaration, is_identifier, is_import_declaration,
    is_import_equals_declaration, is_interface_declaration, is_jsx_attribute, is_jsx_attributes, is_jsx_element,
    is_jsx_expression, is_jsx_fragment, is_jsx_self_closing_element, is_named_imports, is_namespace_import,
    is_new_expression, is_no_substitution_template_literal, is_non_null_expression, is_parenthesized_expression,
    is_property_access_expression, is_property_assignment, is_property_declaration, is_return_statement,
    is_satisfies_expression, is_spread_element, is_string_literal, is_template_expression, is_type_alias_declaration,
    is_type_node, is_variable_declaration, is_variable_statement,
};
use tsrs_core::{P, ScriptKind};
use regex::Regex;
use std::sync::OnceLock;

use super::copyskip::*;
use super::kinds::{is_as_expression, is_type_assertion};
use super::copytext::{JS_DOT, copy_letter_re, looks_like_copy, normalize_whitespace, reads_as_english};
use super::files::{ParsedSource, parse_source, parse_source_text, read_text, source_files};
use super::{
    JsText, Lazy, contains, for_each_child, get_text, is_string_literal_like, js_trim, line_of, parse, slice_js,
    start, walk,
};

static AS_I18N_SKIP_FILE: Lazy = Lazy::new(r"\.(stories|test|spec)\.tsx?$");
static AS_I18N_DEFINITION_FILE: Lazy = Lazy::new(r"(^|/)react/src/i18n-types\.ts$");
static JSX_LITERAL_SKIP_FILE: Lazy = Lazy::new(r"\.(stories|test|spec)\.tsx$");
static REACT_MODULE: Lazy = Lazy::new(r"^@pikku/react(/|$)");
static REACT_SOURCE_FILE: Lazy = Lazy::new(r"(^|/)react/src/");
static LETTER_OR_DIGIT: Lazy = Lazy::new(r"[\p{L}\p{N}]");
static SEP_WORD: Lazy = Lazy::new(r"(?-u:\b)sep(?-u:\b)");
static COPY_PROP_PATTERN: Lazy = Lazy::new(r"^(aria-label|aria-description|title|placeholder|alt)$");
static LOWERCASE_START: Lazy = Lazy::new(r"^[a-z]");

fn react_relative_module() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(&format!(r"^\.{{1,2}}/(?:{JS_DOT}*/)?(?:i18n-types|index)(?:\.js)?$")).unwrap())
}

/// `verify/source-checks.ts` SourceHit.
#[derive(Serialize)]
pub struct SourceHit {
    pub file: String,
    pub line: usize,
    pub text: JsText,
}

fn hit_at(sf: P<SourceFile>, lines: &[&str], pos: usize) -> (usize, JsText) {
    let idx = line_of(sf, pos) - 1;
    let text = if idx < lines.len() { slice_js(js_trim(lines[idx]), 160) } else { JsText(vec![]) };
    (idx + 1, text)
}

fn unwrap_reference(mut expr: P<Node>) -> P<Node> {
    while is_parenthesized_expression(expr)
        || is_as_expression(expr)
        || is_non_null_expression(expr)
        || is_type_assertion(expr)
        || is_satisfies_expression(expr)
    {
        expr = expr.expression().unwrap();
    }
    expr
}

fn is_plain_reference(expr: P<Node>) -> bool {
    let inner = unwrap_reference(expr);
    if is_identifier(inner) || inner.kind() == Kind::ThisKeyword {
        return true;
    }
    if is_property_access_expression(inner) {
        return is_plain_reference(inner.expression().unwrap());
    }
    false
}

fn classify_as_i18n_argument(expr: P<Node>) -> &'static str {
    let inner = unwrap_reference(expr);
    if is_string_literal(inner) {
        "a string literal"
    } else if is_no_substitution_template_literal(inner) || is_template_expression(inner) {
        "a template literal"
    } else if is_call_expression(inner) {
        "a call"
    } else if is_binary_expression(inner) && inner.as_binary_expression().operator_token().kind() == Kind::PlusToken {
        "a concatenation"
    } else {
        "an expression"
    }
}

fn helper_names(sf: P<SourceFile>, helper: &str) -> HashSet<String> {
    let mut names: HashSet<String> = HashSet::new();
    names.insert(helper.to_string());
    for statement in sf.statements().nodes() {
        if is_import_declaration(*statement) {
            if let Some(clause) = statement.as_import_declaration().import_clause {
                if let Some(bindings) = clause.as_import_clause().named_bindings {
                    if is_named_imports(bindings) {
                        for spec in bindings.as_named_imports().elements.nodes() {
                            let imported = spec.property_name().unwrap_or_else(|| spec.name().unwrap());
                            if imported.text() == helper {
                                names.insert(spec.name().unwrap().text().to_string());
                            }
                        }
                    }
                }
            }
        }
        if is_variable_statement(*statement) {
            for decl in statement.as_variable_statement().declaration_list.as_variable_declaration_list().declarations.nodes() {
                let name = decl.name().unwrap();
                if is_identifier(name) && name.text() == helper {
                    names.remove(helper);
                }
            }
        }
        if is_function_declaration(*statement) && statement.name().is_some_and(|n| n.text() == helper) {
            names.remove(helper);
        }
    }
    names
}

fn is_helper_callee(callee: P<Node>, names: &HashSet<String>, helper: &str) -> bool {
    (is_identifier(callee) && names.contains(callee.text()))
        || (is_property_access_expression(callee) && callee.name().unwrap().text() == helper)
}

#[derive(Serialize)]
pub struct AsI18nArgumentHit {
    pub file: String,
    pub line: usize,
    pub text: JsText,
    pub kind: String,
}

pub fn find_as_i18n_arguments(dir: &str) -> Vec<AsI18nArgumentHit> {
    let mut hits = Vec::new();
    for file in source_files(dir, false, true) {
        if AS_I18N_SKIP_FILE.is_match(&file) || AS_I18N_DEFINITION_FILE.is_match(&file) {
            continue;
        }
        let Some(text) = read_text(&file) else { continue };
        if !text.contains("asI18n") {
            continue;
        }
        let sf = parse_source_text(&file, &text);
        let names = helper_names(sf, "asI18n");
        let lines: Vec<&str> = text.split('\n').collect();
        walk(sf.as_node(), &mut |node| {
            if !is_call_expression(node) || !is_helper_callee(node.expression().unwrap(), &names, "asI18n") {
                return;
            }
            let args = node.arguments();
            if args.is_empty() || is_plain_reference(args[0]) {
                return;
            }
            let arg = args[0];
            let (line, text) = hit_at(sf, &lines, start(arg, sf));
            let kind = if is_spread_element(arg) { "an expression" } else { classify_as_i18n_argument(arg) };
            hits.push(AsI18nArgumentHit { file: file.clone(), line, text, kind: kind.to_string() });
        });
    }
    hits
}

#[derive(Serialize)]
pub struct AsI18nStubHit {
    pub file: String,
    pub line: usize,
    pub text: JsText,
    pub copy: JsText,
}

pub fn find_as_i18n_stubs(dir: &str) -> Vec<AsI18nStubHit> {
    let mut hits = Vec::new();
    for file in source_files(dir, false, true) {
        if AS_I18N_SKIP_FILE.is_match(&file) || AS_I18N_DEFINITION_FILE.is_match(&file) {
            continue;
        }
        let Some(text) = read_text(&file) else { continue };
        if !text.contains("asI18nStub") {
            continue;
        }
        let sf = parse_source_text(&file, &text);
        let names = helper_names(sf, "asI18nStub");
        let lines: Vec<&str> = text.split('\n').collect();
        walk(sf.as_node(), &mut |node| {
            if !is_call_expression(node) || !is_helper_callee(node.expression().unwrap(), &names, "asI18nStub") {
                return;
            }
            let args = node.arguments();
            let copy = if let Some(a) = args.first() {
                if is_string_literal_like(Some(*a)) { a.text().to_string() } else { get_text(*a, sf).to_string() }
            } else {
                String::new()
            };
            let (line, text) = hit_at(sf, &lines, start(node, sf));
            hits.push(AsI18nStubHit { file: file.clone(), line, text, copy: slice_js(&normalize_whitespace(&copy), 60) });
        });
    }
    hits
}

#[derive(Serialize)]
pub struct SepArgumentHit {
    pub file: String,
    pub line: usize,
    pub text: JsText,
    pub reason: String,
}

fn imported_helper_bindings(sf: P<SourceFile>, helper: &str, file: &str) -> (HashSet<String>, HashSet<String>) {
    let mut names = HashSet::new();
    let mut namespaces = HashSet::new();
    let in_react_source = REACT_SOURCE_FILE.is_match(file);
    for statement in sf.statements().nodes() {
        if !is_import_declaration(*statement) {
            continue;
        }
        let decl = statement.as_import_declaration();
        if !is_string_literal(decl.module_specifier) {
            continue;
        }
        let spec = decl.module_specifier.text();
        if !REACT_MODULE.is_match(spec) && !(in_react_source && react_relative_module().is_match(spec)) {
            continue;
        }
        let Some(clause) = decl.import_clause else { continue };
        let Some(bindings) = clause.as_import_clause().named_bindings else { continue };
        if is_namespace_import(bindings) {
            namespaces.insert(bindings.name().unwrap().text().to_string());
            continue;
        }
        for el in bindings.as_named_imports().elements.nodes() {
            let imported = el.property_name().unwrap_or_else(|| el.name().unwrap());
            if imported.text() == helper {
                names.insert(el.name().unwrap().text().to_string());
            }
        }
    }
    (names, namespaces)
}

pub fn find_sep_arguments(dir: &str) -> Vec<SepArgumentHit> {
    let mut hits = Vec::new();
    for file in source_files(dir, false, true) {
        if AS_I18N_SKIP_FILE.is_match(&file) || AS_I18N_DEFINITION_FILE.is_match(&file) {
            continue;
        }
        let Some(text) = read_text(&file) else { continue };
        if !SEP_WORD.is_match(&text) {
            continue;
        }
        let sf = parse_source_text(&file, &text);
        let (names, namespaces) = imported_helper_bindings(sf, "sep", &file);
        if names.is_empty() && namespaces.is_empty() {
            continue;
        }
        let lines: Vec<&str> = text.split('\n').collect();
        walk(sf.as_node(), &mut |node| {
            if !is_call_expression(node) {
                return;
            }
            let callee = node.expression().unwrap();
            let is_sep = (is_identifier(callee) && names.contains(callee.text()))
                || (is_property_access_expression(callee)
                    && callee.name().unwrap().text() == "sep"
                    && is_identifier(callee.expression().unwrap())
                    && namespaces.contains(callee.expression().unwrap().text()));
            if !is_sep {
                return;
            }
            let args = node.arguments();
            let inner = if !args.is_empty() && !is_spread_element(args[0]) { Some(unwrap_reference(args[0])) } else { None };
            let reason = match inner {
                None => "not a string literal",
                Some(i) if !is_string_literal_like(Some(i)) => "not a string literal",
                Some(i) if i.text().is_empty() => "empty",
                Some(i) if LETTER_OR_DIGIT.is_match(i.text()) => "contains a letter or digit",
                _ => "",
            };
            if !reason.is_empty() {
                let (line, text) = hit_at(sf, &lines, start(node, sf));
                hits.push(SepArgumentHit { file: file.clone(), line, text, reason: reason.to_string() });
            }
        });
    }
    hits
}

fn is_intrinsic_tag(tag: P<Node>) -> bool {
    is_identifier(tag) && LOWERCASE_START.is_match(tag.text())
}

/// The tag of the element a child (JsxText or JsxExpression) or an attribute
/// belongs to, `None` for a fragment.
fn owning_tag(node: P<Node>) -> Option<P<Node>> {
    let parent = node.parent()?;
    if is_jsx_element(parent) {
        return Some(parent.as_jsx_element().opening_element.tag_name());
    }
    if is_jsx_attributes(parent) {
        return Some(parent.parent().unwrap().tag_name());
    }
    None
}

fn is_element_or_fragment(n: Option<P<Node>>) -> bool {
    n.is_some_and(|n| is_jsx_element(n) || is_jsx_fragment(n))
}

pub fn find_jsx_literal_text(dir: &str, allowed: &[String], gated: bool) -> Vec<SourceHit> {
    let mut hits = Vec::new();
    for file in source_files(dir, false, false) {
        if !file.ends_with(".tsx") || JSX_LITERAL_SKIP_FILE.is_match(&file) {
            continue;
        }
        let Some(text) = read_text(&file) else { continue };
        if text.is_empty() {
            continue;
        }
        let sf = parse(&file, &text, ScriptKind::TSX);
        let mut report = |node: P<Node>, value: &str, hits: &mut Vec<SourceHit>| {
            if let Some(tag) = owning_tag(node) {
                if gated && is_intrinsic_tag(tag) {
                    return;
                }
            }
            let trimmed = normalize_whitespace(value);
            if trimmed.is_empty() || contains(allowed, &trimmed) || !copy_letter_re().is_match(&trimmed) {
                return;
            }
            hits.push(SourceHit { file: file.clone(), line: line_of(sf, start(node, sf)), text: slice_js(&trimmed, 160) });
        };
        walk(sf.as_node(), &mut |node| {
            if node.kind() == Kind::JsxText {
                report(node, node.as_jsx_text().text(), &mut hits);
            } else if is_jsx_expression(node)
                && node.expression().is_some()
                && is_element_or_fragment(node.parent())
                && is_string_literal_like(node.expression())
            {
                report(node, node.expression().unwrap().text(), &mut hits);
            }
        });
    }
    hits
}

/// The literal strings an expression can evaluate to directly.
fn literal_strings(expr: P<Node>) -> Vec<String> {
    if is_parenthesized_expression(expr) || is_as_expression(expr) {
        return literal_strings(expr.expression().unwrap());
    }
    if is_string_literal_like(Some(expr)) {
        return vec![expr.text().to_string()];
    }
    if is_template_expression(expr) {
        return vec![template_text(expr)];
    }
    if is_conditional_expression(expr) {
        let c = expr.as_conditional_expression();
        let mut v = literal_strings(c.when_true);
        v.extend(literal_strings(c.when_false));
        return v;
    }
    if is_binary_expression(expr) {
        let b = expr.as_binary_expression();
        match b.operator_token().kind() {
            Kind::BarBarToken | Kind::QuestionQuestionToken => {
                let mut v = literal_strings(b.left());
                v.extend(literal_strings(b.right()));
                return v;
            }
            Kind::AmpersandAmpersandToken => return literal_strings(b.right()),
            _ => {}
        }
    }
    vec![]
}

/// The template's head text followed by `{…}` and the literal text of each span.
fn template_text(template: P<Node>) -> String {
    let t = template.as_template_expression();
    let mut b = String::new();
    b.push_str(t.head.text());
    for span in t.template_spans.nodes() {
        b.push_str("{…}");
        b.push_str(span.as_template_span().literal.text());
    }
    b
}

fn owned_by_gate(node: P<Node>) -> bool {
    if !is_jsx_attribute(node) && !is_jsx_expression(node) {
        return false;
    }
    owning_tag(node).is_some_and(is_intrinsic_tag)
}

fn in_code_element(sf: P<SourceFile>, node: P<Node>) -> bool {
    let mut cur = node.parent();
    while let Some(p) = cur {
        let tag = if is_jsx_element(p) {
            get_text(p.as_jsx_element().opening_element.tag_name(), sf)
        } else if is_jsx_self_closing_element(p) {
            get_text(p.tag_name(), sf)
        } else {
            ""
        };
        if tag == "code" || tag == "pre" {
            return true;
        }
        cur = p.parent();
    }
    false
}

#[derive(Serialize)]
pub struct JsxLiteralPropHit {
    pub file: String,
    pub line: usize,
    pub via: String,
    pub text: JsText,
}

pub fn find_jsx_literal_props(
    dir: &str,
    allowed: &[String],
    props: &[String],
    helpers: &[String],
    gated: bool,
) -> Vec<JsxLiteralPropHit> {
    let mut hits = Vec::new();
    for file in source_files(dir, false, true) {
        if !file.ends_with(".tsx") || JSX_LITERAL_SKIP_FILE.is_match(&file) {
            continue;
        }
        let Some(ParsedSource { sf, .. }) = parse_source(&file) else { continue };
        let mut report = |node: P<Node>, value: &str, via: &str, hits: &mut Vec<JsxLiteralPropHit>| {
            if gated && owned_by_gate(node) {
                return;
            }
            if !looks_like_copy(value, allowed) {
                return;
            }
            hits.push(JsxLiteralPropHit {
                file: file.clone(),
                line: line_of(sf, start(node, sf)),
                via: via.to_string(),
                text: slice_js(&normalize_whitespace(value), 160),
            });
        };
        walk(sf.as_node(), &mut |node| {
            if is_jsx_attribute(node) && node.initializer().is_some() {
                let name = get_text(node.name().unwrap(), sf);
                let is_copy = !NON_COPY_PROPS.contains(&name)
                    && !name.starts_with("data-")
                    && (contains(props, name) || COPY_PROP_PATTERN.is_match(name));
                if !is_copy || in_code_element(sf, node) {
                    return;
                }
                let init = node.initializer().unwrap();
                let mut exprs: Vec<P<Node>> = vec![];
                if is_string_literal(init) {
                    exprs.push(init);
                } else if is_jsx_expression(init) && init.expression().is_some() {
                    exprs.push(init.expression().unwrap());
                }
                for e in exprs {
                    for s in literal_strings(e) {
                        report(node, &s, name, &mut hits);
                    }
                }
            } else if is_jsx_expression(node)
                && node.expression().is_some()
                && is_element_or_fragment(node.parent())
                && !in_code_element(sf, node)
            {
                if !is_string_literal_like(node.expression()) {
                    for s in literal_strings(node.expression().unwrap()) {
                        report(node, &s, "child", &mut hits);
                    }
                }
            } else if is_call_expression(node) {
                let callee = node.expression().unwrap();
                let name = if is_identifier(callee) {
                    callee.text()
                } else if is_property_access_expression(callee) && is_identifier(callee.expression().unwrap()) {
                    callee.expression().unwrap().text()
                } else {
                    ""
                };
                if !name.is_empty() && contains(helpers, name) && !in_code_element(sf, node) {
                    for arg in node.arguments() {
                        for s in literal_strings(*arg) {
                            report(*arg, &s, &format!("{name}()"), &mut hits);
                        }
                    }
                }
            }
        });
    }
    hits
}

fn root_name(expr: P<Node>) -> String {
    let mut cur = expr;
    loop {
        if is_property_access_expression(cur)
            || is_element_access_expression(cur)
            || is_call_expression(cur)
            || is_non_null_expression(cur)
            || is_parenthesized_expression(cur)
            || is_as_expression(cur)
        {
            cur = cur.expression().unwrap();
            continue;
        }
        break;
    }
    if is_identifier(cur) {
        return cur.text().to_string();
    }
    if cur.kind() == Kind::ImportKeyword {
        return "import".into();
    }
    String::new()
}

fn member_name(callee: P<Node>) -> String {
    if is_property_access_expression(callee) {
        return callee.name().unwrap().text().to_string();
    }
    if is_identifier(callee) {
        return callee.text().to_string();
    }
    String::new()
}

fn property_key_name(name: P<Node>, sf: P<SourceFile>) -> String {
    if is_identifier(name)
        || is_string_literal(name)
        || tsrs_ast::is_numeric_literal(name)
        || is_no_substitution_template_literal(name)
    {
        return name.text().to_string();
    }
    if tsrs_ast::is_computed_property_name(name) {
        return String::new();
    }
    get_text(name, sf).to_string()
}

fn includes_node(list: &[P<Node>], node: P<Node>) -> bool {
    list.iter().any(|n| *n == node)
}

/// Whether the literal, in the position `node` gives it, is one
/// `stringLiteralCopy` reads.
fn copy_position(sf: P<SourceFile>, node: P<Node>, copy_helpers: &[String], in_tsx: bool) -> bool {
    let mut child = node;
    let mut parent = node.parent();
    while let Some(p) = parent {
        if is_parenthesized_expression(p)
            || is_as_expression(p)
            || is_satisfies_expression(p)
            || is_non_null_expression(p)
            || is_type_assertion(p)
        {
            child = p;
            parent = p.parent();
            continue;
        }
        if is_conditional_expression(p) {
            if p.as_conditional_expression().condition == child {
                return false;
            }
            child = p;
            parent = p.parent();
            continue;
        }
        if is_binary_expression(p) {
            let b = p.as_binary_expression();
            let k = b.operator_token().kind();
            let through = k == Kind::BarBarToken
                || k == Kind::QuestionQuestionToken
                || (k == Kind::AmpersandAmpersandToken && b.right() == child);
            if !through {
                return false;
            }
            child = p;
            parent = p.parent();
            continue;
        }
        break;
    }
    let Some(parent) = parent else { return false };
    if is_property_assignment(parent) && parent.initializer() == Some(child) {
        let key = property_key_name(parent.name().unwrap(), sf);
        return !(key.is_empty()
            || copy_prop_name_skip().is_match(&key)
            || key.starts_with("data-")
            || (key.starts_with("aria-") && !copy_aria_copy().is_match(&key)));
    }
    if tsrs_ast::is_array_literal_expression(parent) {
        return array_is_copy(sf, parent);
    }
    if is_return_statement(parent) {
        return true;
    }
    if is_arrow_function(parent) && parent.body() == Some(child) {
        return true;
    }
    if parent.kind() == Kind::Parameter && parent.initializer() == Some(child) {
        return true;
    }
    if is_binding_element(parent) && parent.initializer() == Some(child) {
        return true;
    }
    if is_property_declaration(parent) && parent.initializer() == Some(child) {
        return !copy_prop_name_skip().is_match(get_text(parent.name().unwrap(), sf));
    }
    if is_variable_declaration(parent) && parent.initializer() == Some(child) {
        let name_node = parent.name().unwrap();
        if !is_identifier(name_node) {
            return true;
        }
        let name = name_node.text();
        return (!copy_prop_name_skip().is_match(name) && !copy_constant_name().is_match(name))
            || copy_message_name().is_match(name);
    }
    if is_call_expression(parent) || is_new_expression(parent) {
        if !includes_node(parent.arguments(), child) {
            return false;
        }
        let callee = parent.expression().unwrap();
        if is_new_expression(parent) && copy_new_ignored().is_match(&member_name(callee)) {
            return false;
        }
        let root = root_name(callee);
        let method = member_name(callee);
        if copy_helpers.iter().any(|h| *h == root) {
            return !in_tsx;
        }
        if NON_COPY_CALL_ROOTS.contains(&root.as_str()) || (root.is_empty() && is_call_expression(callee)) {
            return false;
        }
        if NON_COPY_METHODS.contains(&method.as_str()) {
            return false;
        }
        if copy_error_suffix().is_match(&method) || copy_throw_prefix().is_match(&method) {
            return false;
        }
        if is_identifier(callee) && copy_entry_re().is_match(callee.text()) {
            return false;
        }
        return true;
    }
    false
}

/// An array of identifiers or keys is a list of tokens, not copy.
fn array_is_copy(sf: P<SourceFile>, array: P<Node>) -> bool {
    let parent = array.parent().unwrap();
    if is_property_assignment(parent) && copy_prop_name_skip().is_match(&property_key_name(parent.name().unwrap(), sf)) {
        return false;
    }
    if is_variable_declaration(parent)
        && is_identifier(parent.name().unwrap())
        && copy_prop_name_skip().is_match(parent.name().unwrap().text())
    {
        return false;
    }
    if is_call_expression(parent) && includes_node(parent.arguments(), array) {
        let callee = parent.expression().unwrap();
        if NON_COPY_METHODS.contains(&member_name(callee).as_str())
            || NON_COPY_CALL_ROOTS.contains(&root_name(callee).as_str())
        {
            return false;
        }
    }
    true
}

fn is_skipped_by_string_literal_copy(node: P<Node>) -> bool {
    is_import_declaration(node)
        || is_export_declaration(node)
        || is_import_equals_declaration(node)
        || is_type_node(node)
        || is_jsx_attribute(node)
        || node.kind() == Kind::JsxText
        || is_type_alias_declaration(node)
        || is_interface_declaration(node)
        || is_decorator(node)
}

pub fn find_string_literal_copy(dir: &str, copy_helpers: &[String]) -> Vec<SourceHit> {
    let mut hits = Vec::new();
    for file in source_files(dir, false, true) {
        if copy_skip_file().is_match(&file) {
            continue;
        }
        let Some(ParsedSource { sf, .. }) = parse_source(&file) else { continue };
        let in_tsx = file.ends_with(".tsx");
        fn visit(
            node: P<Node>,
            sf: P<SourceFile>,
            file: &str,
            copy_helpers: &[String],
            in_tsx: bool,
            hits: &mut Vec<SourceHit>,
        ) {
            if is_skipped_by_string_literal_copy(node) {
                return;
            }
            if is_jsx_expression(node)
                && is_element_or_fragment(node.parent())
                && node.expression().is_some()
                && (is_string_literal_like(node.expression()) || is_template_expression(node.expression().unwrap()))
            {
                return;
            }
            let mut value = String::new();
            let mut is_literal = false;
            if is_string_literal_like(Some(node)) {
                value = node.text().to_string();
                is_literal = true;
            } else if is_template_expression(node) {
                value = template_text(node);
                is_literal = true;
            }
            if is_literal {
                let multiline = !is_string_literal(node) && get_text(node, sf).contains('\n');
                if !multiline
                    && reads_as_english(&value.replace("{…}", " "))
                    && copy_position(sf, node, copy_helpers, in_tsx)
                {
                    hits.push(SourceHit {
                        file: file.to_string(),
                        line: line_of(sf, start(node, sf)),
                        text: slice_js(&normalize_whitespace(&value), 160),
                    });
                }
            }
            for_each_child(node, &mut |c| visit(c, sf, file, copy_helpers, in_tsx, hits));
        }
        visit(sf.as_node(), sf, &file, copy_helpers, in_tsx, &mut hits);
    }
    hits
}

#[allow(dead_code)]
fn _unused(_: HashMap<u8, u8>) {
    let _ = is_array_literal_expression;
}
