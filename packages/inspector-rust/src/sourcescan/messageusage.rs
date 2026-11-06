//! Port of `messageusage.go`: `i18n-usage.ts` scanMessageUsage.

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use tsrs_ast::{
    Kind, Node, is_binding_element, is_block, is_catch_clause, is_class_declaration,
    is_element_access_expression, is_export_declaration, is_for_in_statement, is_for_of_statement, is_for_statement,
    is_function_declaration, is_function_expression, is_function_like, is_identifier, is_import_declaration,
    is_jsx_attribute, is_module_block, is_namespace_import, is_object_binding_pattern, is_omitted_expression,
    is_property_assignment, is_property_access_expression, is_qualified_name, is_source_file,
    is_variable_declaration, is_variable_declaration_list, is_variable_statement, is_string_literal,
};
use tsrs_core::P;

use super::kinds::is_case_block;
use super::files::{parse_source, source_files};
use super::{Lazy, for_each_child, get_text, is_string_literal_like, js_whitespace_run, line_of, slice_utf16, start};

static MESSAGES_MODULE: Lazy = Lazy::new(r"(?:^|/)(?:i18n|paraglide)/messages(?:/index)?(?:\.[cm]?[jt]sx?)?$");

#[derive(Serialize)]
pub struct MessageSite {
    pub file: String,
    pub line: usize,
    pub text: String,
}

#[derive(Serialize)]
pub struct KeyUsage {
    pub key: String,
    pub files: Vec<String>,
}

#[derive(Serialize)]
pub struct MessageUsage {
    pub keys: Vec<String>,
    #[serde(rename = "usedIn")]
    pub used_in: Vec<KeyUsage>,
    pub computed: Vec<MessageSite>,
    pub unparsed: Vec<String>,
    pub files: usize,
}

fn namespace_aliases(sf: P<tsrs_ast::SourceFile>) -> HashSet<String> {
    let mut aliases = HashSet::new();
    for stmt in sf.statements().nodes() {
        if !is_import_declaration(*stmt) {
            continue;
        }
        let decl = stmt.as_import_declaration();
        if !is_string_literal(decl.module_specifier) {
            continue;
        }
        let from_messages = MESSAGES_MODULE.is_match(decl.module_specifier.text());
        let Some(clause) = decl.import_clause else { continue };
        let Some(bindings) = clause.as_import_clause().named_bindings else { continue };
        if is_namespace_import(bindings) {
            if from_messages {
                aliases.insert(bindings.name().unwrap().text().to_string());
            }
            continue;
        }
        for el in bindings.as_named_imports().elements.nodes() {
            let mut imported = el.name().unwrap();
            let property_name = el.property_name();
            if let Some(p) = property_name {
                imported = p;
            }
            if imported.text() == "m" && (from_messages || property_name.is_none()) {
                aliases.insert(el.name().unwrap().text().to_string());
            }
        }
    }
    aliases
}

fn is_declaration_name(n: P<Node>) -> bool {
    let p = n.parent().unwrap();
    if p.kind() == Kind::Parameter
        || is_variable_declaration(p)
        || is_binding_element(p)
        || is_property_access_expression(p)
        || is_property_assignment(p)
        || is_jsx_attribute(p)
    {
        return p.name() == Some(n);
    }
    if is_qualified_name(p) {
        return p.as_qualified_name().right == n;
    }
    false
}

fn binds_name(name: P<Node>, text: &str) -> bool {
    if is_identifier(name) {
        return name.text() == text;
    }
    for el in name.as_binding_pattern().elements.nodes() {
        if !is_omitted_expression(*el) && binds_name(el.name().unwrap(), text) {
            return true;
        }
    }
    false
}

fn declares_name(list: Option<P<Node>>, text: &str) -> bool {
    let Some(list) = list else { return false };
    if !is_variable_declaration_list(list) {
        return false;
    }
    list.as_variable_declaration_list()
        .declarations
        .nodes()
        .iter()
        .any(|d| binds_name(d.name().unwrap(), text))
}

fn is_shadowed(n: P<Node>) -> bool {
    let text = n.text();
    let mut cur = n.parent();
    while let Some(p) = cur {
        if is_source_file(p) {
            return false;
        } else if is_function_like(p) {
            for param in p.parameters() {
                if binds_name(param.name().unwrap(), text) {
                    return true;
                }
            }
            if (is_function_expression(p) || is_function_declaration(p)) && p.name().is_some_and(|nm| nm.text() == text)
            {
                return true;
            }
        } else if is_block(p) || is_module_block(p) || is_case_block(p) {
            let mut statements: Vec<P<Node>> = Vec::new();
            if is_case_block(p) {
                for c in p.as_case_block().clauses.nodes() {
                    statements.extend_from_slice(c.as_case_or_default_clause().statements.nodes());
                }
            } else if is_block(p) {
                statements.extend_from_slice(p.as_block().statements.nodes());
            } else {
                statements.extend_from_slice(p.as_module_block().statements.nodes());
            }
            for st in statements {
                if is_variable_statement(st) && declares_name(Some(st.as_variable_statement().declaration_list), text) {
                    return true;
                }
                if (is_function_declaration(st) || is_class_declaration(st)) && st.name().is_some_and(|nm| nm.text() == text)
                {
                    return true;
                }
            }
        } else if is_for_statement(p) {
            if declares_name(p.as_for_statement().initializer, text) {
                return true;
            }
        } else if is_for_in_statement(p) || is_for_of_statement(p) {
            if declares_name(Some(p.as_for_in_or_of_statement().initializer), text) {
                return true;
            }
        } else if is_catch_clause(p) {
            if let Some(v) = p.as_catch_clause().variable_declaration {
                if binds_name(v.name().unwrap(), text) {
                    return true;
                }
            }
        }
        cur = p.parent();
    }
    false
}

pub fn scan_message_usage(root: &str) -> MessageUsage {
    let mut usage = MessageUsage { keys: vec![], used_in: vec![], computed: vec![], unparsed: vec![], files: 0 };
    let mut seen_key: HashMap<String, usize> = HashMap::new();
    let mut seen_file: HashMap<String, HashSet<String>> = HashMap::new();
    for file in source_files(root, false, true) {
        let parsed = parse_source(&file);
        usage.files += 1;
        if parsed.as_ref().is_none_or(|p| !p.ok) {
            usage.unparsed.push(file.clone());
        }
        let Some(parsed) = parsed else { continue };
        let sf = parsed.sf;
        let aliases = namespace_aliases(sf);
        let is_definition = MESSAGES_MODULE.is_match(&file);
        if aliases.is_empty() {
            continue;
        }
        struct Ctx<'a> {
            usage: &'a mut MessageUsage,
            seen_key: &'a mut HashMap<String, usize>,
            seen_file: &'a mut HashMap<String, HashSet<String>>,
            file: &'a str,
            sf: P<tsrs_ast::SourceFile>,
            aliases: &'a HashSet<String>,
            is_definition: bool,
        }
        impl Ctx<'_> {
            fn site(&mut self, n: P<Node>, why: &str) {
                let raw = get_text(n.parent().unwrap(), self.sf);
                let text = js_whitespace_run().replace_all(raw, " ");
                self.usage.computed.push(MessageSite {
                    file: self.file.to_string(),
                    line: line_of(self.sf, start(n, self.sf)),
                    text: format!("{why}: {}", slice_utf16(&text, 100)),
                });
            }
            fn use_key(&mut self, key: &str) {
                let idx = match self.seen_key.get(key) {
                    Some(i) => *i,
                    None => {
                        let idx = self.usage.used_in.len();
                        self.seen_key.insert(key.to_string(), idx);
                        self.seen_file.insert(key.to_string(), HashSet::new());
                        self.usage.keys.push(key.to_string());
                        self.usage.used_in.push(KeyUsage { key: key.to_string(), files: vec![] });
                        idx
                    }
                };
                if self.seen_file.get_mut(key).unwrap().insert(self.file.to_string()) {
                    self.usage.used_in[idx].files.push(self.file.to_string());
                }
            }
            fn visit(&mut self, n: P<Node>) {
                if is_import_declaration(n) || is_export_declaration(n) {
                    return;
                }
                if is_identifier(n) && self.aliases.contains(n.text()) && !is_declaration_name(n) && !is_shadowed(n) {
                    let p = n.parent().unwrap();
                    if is_property_access_expression(p) && p.expression() == Some(n) {
                        self.use_key(p.name().unwrap().text());
                    } else if is_qualified_name(p) && p.as_qualified_name().left == n {
                        self.use_key(p.as_qualified_name().right.text());
                    } else if is_element_access_expression(p) && p.expression() == Some(n) {
                        let arg = p.as_element_access_expression().argument_expression;
                        if is_string_literal_like(Some(arg)) {
                            self.use_key(arg.text());
                        } else {
                            self.site(n, "computed access");
                        }
                    } else if is_variable_declaration(p)
                        && p.initializer() == Some(n)
                        && is_object_binding_pattern(p.name().unwrap())
                    {
                        for el in p.name().unwrap().as_binding_pattern().elements.nodes() {
                            let b = el.as_binding_element();
                            let name = b.property_name().unwrap_or_else(|| el.name().unwrap());
                            if b.dot_dot_dot_token().is_some()
                                || (!is_identifier(name) && !is_string_literal_like(Some(name)))
                            {
                                self.site(n, "destructured with rest or computed name");
                            } else {
                                self.use_key(name.text());
                            }
                        }
                    } else if !self.is_definition {
                        self.site(n, "namespace used as a value");
                    }
                }
                for_each_child(n, &mut |c| self.visit(c));
            }
        }
        let mut ctx = Ctx {
            usage: &mut usage,
            seen_key: &mut seen_key,
            seen_file: &mut seen_file,
            file: &file,
            sf,
            aliases: &aliases,
            is_definition,
        };
        ctx.visit(sf.as_node());
    }
    usage
}
