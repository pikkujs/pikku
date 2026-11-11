//! Port of Go `visit/check_classification.go`: check-pii-output.ts,
//! check-classified-sinks.ts and add-functions.ts's classificationCheck block.

use std::collections::HashSet;

use tsrs_ast::{self as ast, Node, Symbol};
use tsrs_checker::{ObjectFlags, Type, TypeFlags};
use tsrs_core::P;

use super::Context;
use crate::diag::{Level, codes};
use crate::tsutil;
use tsrs_checker::LiteralValue;

/// `ClassifiedField`.
#[derive(Clone, Debug)]
pub struct ClassifiedField {
    pub path: String,
    pub classification: String,
}

/// Go `firstDeclaration`: the value declaration, else the first declaration.
fn first_declaration(sym: P<Symbol>) -> Option<P<Node>> {
    sym.value_declaration().or_else(|| sym.declarations().first().copied())
}

/// `literalString`: the marker is optional, so its resolved type is usually
/// `'pii' | undefined`, not a bare literal.
fn literal_string(t: P<Type>) -> Option<String> {
    if t.flags().intersects(TypeFlags::StringLiteral) {
        return match t.as_literal_type().value() {
            Some(LiteralValue::String(s)) => Some(s.to_string()),
            _ => None,
        };
    }
    if t.is_union() {
        return t.types().iter().find_map(|m| literal_string(*m));
    }
    None
}

/// `classifiedSink` (check-classified-sinks.ts SINKS). `None` methods means
/// every method on the type is a sink.
struct ClassifiedSink {
    core_type: &'static str,
    methods: Option<&'static [&'static str]>,
    rejects: &'static [&'static str],
}

const CLASSIFIED_SINKS: [ClassifiedSink; 6] = [
    ClassifiedSink { core_type: "Logger", methods: None, rejects: &["secret", "pii"] },
    ClassifiedSink { core_type: "WebhookService", methods: Some(&["send"]), rejects: &["secret", "pii"] },
    ClassifiedSink { core_type: "QueueService", methods: Some(&["add"]), rejects: &["secret"] },
    ClassifiedSink { core_type: "EmailService", methods: Some(&["send"]), rejects: &["secret"] },
    ClassifiedSink { core_type: "AuditService", methods: Some(&["audit", "write"]), rejects: &["secret"] },
    ClassifiedSink { core_type: "AuditLog", methods: Some(&["write"]), rejects: &["secret"] },
];

const CONSOLE_REJECTS: &[&str] = &["secret", "pii"];

struct SinkViolation {
    sink: String,
    path: String,
    line: usize,
    classification: String,
}

impl Context<'_> {
    /// `findPiiPaths`: every `__classification__` brand reachable from `t`, with
    /// its dotted path.
    pub fn find_pii_paths(&mut self, t: P<Type>, path: &str, depth: usize, seen: &mut HashSet<P<Type>>) -> Vec<ClassifiedField> {
        if depth > 8 || !seen.insert(t) {
            return Vec::new();
        }
        let mut path = path.to_string();

        if t.is_intersection() {
            for member in t.types() {
                for prop in self.checker.get_properties_of_type_exported(*member) {
                    if prop.name() != "__classification__" {
                        continue;
                    }
                    let mut classification = "private".to_string();
                    if let Some(decl) = first_declaration(*prop)
                        && let Some(ty) = self.checker.get_type_of_symbol_at_location(*prop, Some(decl))
                        && let Some(level) = literal_string(ty)
                    {
                        classification = level;
                    }
                    if path.is_empty() {
                        path = "<return value>".to_string();
                    }
                    return vec![ClassifiedField { path, classification }];
                }
            }
        }

        let mut violations = Vec::new();
        if t.is_union() {
            for branch in tsutil::typeorder::union_types_in_id_order(t) {
                violations.extend(self.find_pii_paths(branch, &path, depth, seen));
            }
            return violations;
        }

        if t.flags().intersects(TypeFlags::Object) {
            if t.object_flags().intersects(ObjectFlags::Reference) {
                for arg in self.checker.get_type_arguments_exported(t) {
                    violations.extend(self.find_pii_paths(*arg, &path, depth + 1, seen));
                }
            }

            let number = self.checker.get_number_type();
            if let Some(info) = self.checker.get_index_info_of_type_exported(t, number) {
                violations.extend(self.find_pii_paths(info.value_type(), &format!("{path}[]"), depth + 1, seen));
            }
            let string = self.checker.get_string_type();
            if let Some(info) = self.checker.get_index_info_of_type_exported(t, string) {
                violations.extend(self.find_pii_paths(info.value_type(), &format!("{path}[*]"), depth + 1, seen));
            }

            // tsPropertyNames, not GetPropertiesOfType: the paths are printed,
            // so they have to come out in TypeScript's order.
            for key in self.ts_property_names(t) {
                let Some(prop) = self.checker.get_property_of_type_exported(t, &key) else { continue };
                let name = prop.name();
                if name.starts_with("__") {
                    continue;
                }
                let Some(decl) = first_declaration(prop) else { continue };
                let sub_path = if path.is_empty() { name.to_string() } else { format!("{path}.{name}") };
                let Some(pt) = self.checker.get_type_of_symbol_at_location(prop, Some(decl)) else { continue };
                violations.extend(self.find_pii_paths(pt, &sub_path, depth + 1, seen));
            }
        }
        violations
    }

    /// `typeExtendsCore` is does-type-extend-core-type.ts doesTypeExtendsCore.
    fn type_extends_core(&mut self, t: Option<P<Type>>, visited: &mut HashSet<P<Type>>, core_type: &str) -> bool {
        let Some(t) = t else { return false };
        if !visited.insert(t) {
            return false;
        }
        if let Some(sym) = t.symbol() {
            if sym.name() == core_type {
                return true;
            }
            if t.object_flags().intersects(ObjectFlags::ClassOrInterface) {
                for base in self.checker.get_base_types_exported(t) {
                    if self.type_extends_core(Some(*base), visited, core_type) {
                        return true;
                    }
                }
            }
        }
        if let Some(a) = t.alias()
            && let Some(asym) = a.symbol()
        {
            let declared = self.checker.get_declared_type_of_symbol_exported(asym);
            if self.type_extends_core(Some(declared), visited, core_type) {
                return true;
            }
        }
        if t.is_union() || t.is_intersection() {
            for member in t.types() {
                if self.type_extends_core(Some(*member), visited, core_type) {
                    return true;
                }
            }
        }
        false
    }

    /// `findClassifiedSinks`.
    fn find_classified_sinks(&mut self, handler: P<Node>) -> Vec<SinkViolation> {
        let mut violations = Vec::new();
        self.collect_sinks(handler, &mut violations);
        violations
    }

    fn collect_sinks(&mut self, n: P<Node>, violations: &mut Vec<SinkViolation>) {
        if ast::is_call_expression(n) && n.expression().is_some_and(ast::is_property_access_expression) {
            if let Some((name, rejects)) = self.describe_sink(n.expression().unwrap()) {
                for arg in n.arguments() {
                    if let Some((found, classification)) = self.find_classified_expression(*arg, rejects, false) {
                        let sf = tsutil::source_file_of(found);
                        violations.push(SinkViolation {
                            sink: name.clone(),
                            path: tsutil::node_text(found).to_string(),
                            line: tsrs_scanner::get_ecma_line_of_position(sf.get(), tsutil::node_start(found) as u32) as usize + 1,
                            classification: classification.to_string(),
                        });
                    }
                }
            }
        }
        let mut children = Vec::new();
        n.for_each_child(&mut |c| {
            children.push(c);
            false
        });
        for c in children {
            self.collect_sinks(c, violations);
        }
    }

    /// `findClassifiedExpression`. The TS walk uses getChildren and this
    /// ForEachChild; what that omits (punctuation, SyntaxLists, JSDoc) is never
    /// an expression.
    fn find_classified_expression(
        &mut self,
        n: P<Node>,
        rejects: &[&'static str],
        is_receiver: bool,
    ) -> Option<(P<Node>, &'static str)> {
        let mut children = Vec::new();
        n.for_each_child(&mut |c| {
            children.push(c);
            false
        });
        for c in children {
            if ast::is_property_assignment(n) && n.name() == Some(c) {
                continue;
            }
            let child_is_receiver = (ast::is_property_access_expression(n) || ast::is_element_access_expression(n))
                && n.expression() == Some(c);
            if let Some(found) = self.find_classified_expression(c, rejects, child_is_receiver) {
                return Some(found);
            }
        }

        if !is_receiver && ast::is_expression(n) && !ast::is_string_literal_like(n) {
            let t = self.checker.get_type_at_location(n);
            // secret outranks pii when a value somehow carries both.
            for level in ["secret", "pii"] {
                if !rejects.contains(&level) {
                    continue;
                }
                let fields = self.find_pii_paths(t, "", 0, &mut HashSet::new());
                if fields.iter().any(|f| f.classification == level) {
                    return Some((n, if level == "secret" { "secret" } else { "pii" }));
                }
            }
        }
        None
    }

    /// `describeSink`.
    fn describe_sink(&mut self, callee: P<Node>) -> Option<(String, &'static [&'static str])> {
        let method = callee.name()?.text();
        let receiver = callee.expression()?;
        if ast::is_identifier(receiver) && receiver.text() == "console" {
            return Some((format!("console.{method}"), CONSOLE_REJECTS));
        }
        let receiver_type = self.checker.get_type_at_location(receiver);
        for sink in &CLASSIFIED_SINKS {
            if sink.methods.is_some_and(|ms| !ms.contains(&method)) {
                continue;
            }
            if self.type_extends_core(Some(receiver_type), &mut HashSet::new(), sink.core_type) {
                return Some((format!("{}.{method}", tsutil::node_text(receiver)), sink.rejects));
            }
        }
        None
    }

    /// `checkClassification` is add-functions.ts's classificationCheck block:
    /// PKU953 and PKU954 for values written to a sink, PKU910 for values
    /// returned. Opt-in (`pikku all --security`), because inferring every
    /// handler's return type is the most expensive checker operation in the
    /// sweep.
    pub fn check_classification(&mut self, name: &str, handler: P<Node>, sessionless: bool) {
        for v in self.find_classified_sinks(handler) {
            if v.classification == "secret" {
                self.log.diagnostic(
                    Level::Error,
                    codes::SECRET_REVEALED_INTO_SINK,
                    format!(
                        "Function '{name}' passes a revealed secret to '{}' at line {} (path '{}').\n  A vault secret must not be written to a log, an audit, a queue, an email or a webhook. Pass the value only to the client that needs it, and reveal it there.",
                        v.sink, v.line, v.path
                    ),
                );
                continue;
            }
            self.log.diagnostic(
                Level::Error,
                codes::PII_INTO_SINK,
                format!(
                    "Function '{name}' passes personal data to '{}' at line {} (path '{}').\n  A log, the console and a webhook all leave your control — they are shipped to third parties and retained long past the request. Log an id instead, or narrow the value to a non-identifying field. An email to the data subject, an audit in your own database and a queue on your own infrastructure are fine.",
                    v.sink, v.line, v.path
                ),
            );
        }

        let sig = self.checker.get_signature_from_declaration_exported(handler);
        let ret = self.checker.get_return_type_of_signature_exported(sig);
        let ret = self.unwrap_promise(ret);
        let (mut secret_paths, mut private_paths) = (Vec::new(), Vec::new());
        for f in self.find_pii_paths(ret, "", 0, &mut HashSet::new()) {
            match f.classification.as_str() {
                "secret" => secret_paths.push(format!("'{}'", f.path)),
                "private" | "pii" => private_paths.push(format!("'{}'", f.path)),
                _ => {}
            }
        }
        if !secret_paths.is_empty() {
            self.log.diagnostic(
                Level::Error,
                codes::PII_IN_OUTPUT,
                format!(
                    "Function '{name}' exposes secret-classified field(s) in its return type: {}.\n  Secret fields must never appear in function output. Strip these fields before returning or change the column classification.",
                    secret_paths.join(", ")
                ),
            );
        }
        if sessionless && !private_paths.is_empty() {
            self.log.diagnostic(
                Level::Error,
                codes::PII_IN_OUTPUT,
                format!(
                    "Sessionless function '{name}' exposes private-classified field(s) in its return type: {}.\n  Private fields are only safe to return from authenticated (sessioned) functions. Either require a session (use pikkuFunc) or set the column's security to 'public' in db/annotations.ts if it is safe to expose publicly.",
                    private_paths.join(", ")
                ),
            );
        }
    }
}
