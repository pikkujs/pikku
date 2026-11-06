//! Port of Go `tsjg/parser/function_node_parser.go`: function types and
//! declarations (src/NodeParser/FunctionNodeParser.ts). Also holds the helpers
//! shared with ConstructorNodeParser and TypeofNodeParser, and the comment
//! building from src/Type/FunctionType.ts and ConstructorType.ts.

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::shared::{node_full_text, node_text};
use super::{Context, NodeParser, SubNodeParser, get_node_key};
use crate::tsjg::config::FunctionOptions;
use crate::tsjg::types::{self, AdditionalProperties, ConstructorType, FunctionType, ObjectProperty, Ty, TypeKind};

pub struct FunctionNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
    functions: FunctionOptions,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>, functions: FunctionOptions) -> Rc<FunctionNodeParser> {
    Rc::new(FunctionNodeParser { child_node_parser, functions })
}

impl SubNodeParser for FunctionNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        matches!(node.kind(), Kind::FunctionType | Kind::FunctionExpression | Kind::ArrowFunction | Kind::FunctionDeclaration)
    }

    fn create_type(&self, node: P<Node>, context: &Context, _reference: Option<&Ty>) -> Ty {
        if self.functions == FunctionOptions::Hide {
            return types::new(TypeKind::Never);
        }

        let name = get_type_name(node);
        let function = new_function_type(
            node,
            get_named_arguments(&self.child_node_parser, node, context),
            get_return_type(&self.child_node_parser, node, context),
        );
        if !name.is_empty() {
            return types::new_definition_type(name, function);
        }
        function
    }
}

/// Mirrors the FunctionType constructor upstream, which builds the signature
/// comment from the raw source text of the node.
pub fn new_function_type(node: P<Node>, named_arguments: Option<Ty>, return_type: Option<Ty>) -> Ty {
    types::new(TypeKind::Function(FunctionType { comment: signature_comment(Some(node), ""), named_arguments, return_type }))
}

/// Mirrors the ConstructorType constructor upstream.
pub fn new_constructor_type(node: P<Node>, named_arguments: Option<Ty>) -> Ty {
    types::new(TypeKind::Constructor(ConstructorType { comment: signature_comment(Some(node), "new "), named_arguments }))
}

/// Renders `(<param full texts>) =><return type full text>`. getFullText()
/// includes leading trivia, and an absent return type renders as the string
/// "undefined" (an upstream template-literal quirk that the golden fixtures
/// rely on).
pub fn signature_comment(node: Option<P<Node>>, prefix: &str) -> String {
    let Some(node) = node else { return String::new() };
    let params: Vec<String> = node.parameters().iter().map(|p| node_full_text(*p)).collect();
    let return_text = match node.type_node() {
        Some(t) => node_full_text(t),
        None => "undefined".to_string(),
    };
    format!("{prefix}({}) =>{return_text}", params.join(","))
}

/// Parses the parameters of a function-like node into an Object type, or
/// returns the Infer type directly for signatures like `(...args: infer T)`.
/// None for parameterless signatures.
pub fn get_named_arguments(child_node_parser: &Rc<dyn NodeParser>, node: P<Node>, context: &Context) -> Option<Ty> {
    let parameters = node.parameters();
    if parameters.is_empty() {
        return None;
    }

    // Special case for when the function signature is (...args: infer T).
    if parameters.len() == 1 {
        let parameter_type = child_node_parser.create_type(Some(parameters[0]), context, None);
        if matches!(&*parameter_type, TypeKind::Infer(_)) {
            return Some(parameter_type);
        }
    }

    let properties: Vec<ObjectProperty> = parameters
        .iter()
        .map(|parameter| {
            let parameter_type = child_node_parser.create_type(Some(*parameter), context, None);
            // If it's missing a questionToken but has an initializer we can
            // consider the property as not required.
            let required = if parameter.question_token().is_none() { parameter.initializer().is_none() } else { false };
            ObjectProperty::new(node_text(parameter.name().unwrap()), parameter_type, required)
        })
        .collect();

    Some(types::new_object_type(
        format!("object-{}", get_node_key(node, context)),
        Vec::new(),
        properties,
        Some(AdditionalProperties::Bool(false)),
        false,
    ))
}

/// Parses the return type of a function-like node. Type predicates map to
/// boolean (type guards) or void (assertion functions). None when the node has
/// no return type annotation.
pub fn get_return_type(child_node_parser: &Rc<dyn NodeParser>, node: P<Node>, context: &Context) -> Option<Ty> {
    let return_type = node.type_node()?;

    // Type predicates (`value is T` / `asserts value is T` / `asserts value`)
    // are compile-time-only constructs. At runtime, type guards return
    // boolean and assertion functions return void.
    if return_type.kind() == Kind::TypePredicate {
        if return_type.as_type_predicate_node().asserts_modifier().is_some() {
            return Some(types::new(TypeKind::Void));
        }
        return Some(types::new(TypeKind::Boolean));
    }
    Some(child_node_parser.create_type(Some(return_type), context, None))
}

/// The name under which a function-like node should be exposed as a
/// definition, or "" when it is anonymous.
pub fn get_type_name(node: P<Node>) -> String {
    if matches!(node.kind(), Kind::ArrowFunction | Kind::FunctionExpression | Kind::FunctionType) {
        if let Some(parent) = node.parent() {
            if parent.kind() == Kind::VariableDeclaration {
                return node_text(parent.name().unwrap());
            }
        }
    }
    if node.kind() == Kind::FunctionDeclaration {
        if let Some(name) = node.name() {
            return node_text(name);
        }
    }
    String::new()
}
