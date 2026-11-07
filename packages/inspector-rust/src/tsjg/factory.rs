//! Port of Go `tsjg/factory/wiring.go`: wiring of the parser and formatter
//! chains. Registration order is load-bearing: the first parser or formatter
//! whose `supports_*` matches wins.

use std::rc::Rc;

use super::config::Config;
use super::parser::{Chk, NodeParser, SubNodeParser};
use super::formatter::{
    ChainTypeFormatter, CircularReferenceTypeFormatter, TypeFormatter,
    alias_type_formatter::AliasTypeFormatter, annotated_type_formatter::AnnotatedTypeFormatter,
    any_type_formatter::AnyTypeFormatter, array_type_formatter::ArrayTypeFormatter,
    boolean_type_formatter::BooleanTypeFormatter, constructor_type_formatter::ConstructorTypeFormatter,
    definition_type_formatter::DefinitionTypeFormatter, enum_type_formatter::EnumTypeFormatter,
    function_type_formatter::FunctionTypeFormatter, hidden_type_formatter::HiddenTypeFormatter,
    intersection_type_formatter::IntersectionTypeFormatter, literal_type_formatter::LiteralTypeFormatter,
    literal_union_type_formatter::LiteralUnionTypeFormatter, never_type_formatter::NeverTypeFormatter,
    null_type_formatter::NullTypeFormatter, number_type_formatter::NumberTypeFormatter,
    object_type_formatter::ObjectTypeFormatter, optional_type_formatter::OptionalTypeFormatter,
    primitive_union_type_formatter::PrimitiveUnionTypeFormatter, reference_type_formatter::ReferenceTypeFormatter,
    rest_type_formatter::RestTypeFormatter, string_type_formatter::StringTypeFormatter,
    symbol_type_formatter::SymbolTypeFormatter, tuple_type_formatter::TupleTypeFormatter,
    undefined_type_formatter::UndefinedTypeFormatter, union_type_formatter::UnionTypeFormatter,
    unknown_type_formatter::UnknownTypeFormatter, void_type_formatter::VoidTypeFormatter,
};

// ===== CreateFormatter (factory/formatter.ts) =====

/// Assembles the type formatter chain.
pub fn create_formatter(cfg: &Config) -> Rc<dyn TypeFormatter> {
    let chain = ChainTypeFormatter::new();
    let circular = CircularReferenceTypeFormatter::new(chain.clone());
    let c = || -> Rc<dyn TypeFormatter> { circular.clone() };

    chain
        .add_type_formatter(AnnotatedTypeFormatter::new(c()))
        .add_type_formatter(StringTypeFormatter::new())
        .add_type_formatter(NumberTypeFormatter::new())
        .add_type_formatter(BooleanTypeFormatter::new())
        .add_type_formatter(NullTypeFormatter::new())
        .add_type_formatter(SymbolTypeFormatter::new())
        .add_type_formatter(AnyTypeFormatter::new())
        .add_type_formatter(UndefinedTypeFormatter::new())
        .add_type_formatter(UnknownTypeFormatter::new())
        .add_type_formatter(VoidTypeFormatter::new())
        .add_type_formatter(HiddenTypeFormatter::new())
        .add_type_formatter(NeverTypeFormatter::new())
        .add_type_formatter(LiteralTypeFormatter::new())
        .add_type_formatter(EnumTypeFormatter::new())
        .add_type_formatter(ReferenceTypeFormatter::new(c(), cfg.encode_refs))
        .add_type_formatter(DefinitionTypeFormatter::new(c(), cfg.encode_refs))
        .add_type_formatter(ObjectTypeFormatter::new(c()))
        .add_type_formatter(AliasTypeFormatter::new(c()))
        .add_type_formatter(PrimitiveUnionTypeFormatter::new())
        .add_type_formatter(LiteralUnionTypeFormatter::new())
        .add_type_formatter(ConstructorTypeFormatter::new(c(), cfg.functions))
        .add_type_formatter(FunctionTypeFormatter::new(c(), cfg.functions))
        .add_type_formatter(OptionalTypeFormatter::new(c()))
        .add_type_formatter(RestTypeFormatter::new(c()))
        .add_type_formatter(ArrayTypeFormatter::new(c()))
        .add_type_formatter(TupleTypeFormatter::new(c()))
        .add_type_formatter(UnionTypeFormatter::new(c(), cfg.discriminator_type))
        .add_type_formatter(IntersectionTypeFormatter::new(c()));

    circular
}

// ===== CreateParser (factory/parser.ts) =====

/// Assembles the node parser chain (factory/parser.ts). Registration order is
/// load-bearing: the first parser whose `supports_node` matches wins.
pub fn create_parser(chk: Chk, cfg: &Config) -> Rc<dyn NodeParser> {
    use super::config::JsDocMode;
    use super::parser::*;
    let chain = ChainNodeParser::new(chk.clone());
    let synth = shared::SynthesizedSymbols::new();
    let np = || -> Rc<dyn NodeParser> { chain.clone() };
    let sp = || -> Rc<dyn SubNodeParser> { chain.clone() };
    let extra_tags: std::collections::HashSet<String> = cfg.extra_tags.iter().cloned().collect();

    let with_expose = |p: Rc<dyn SubNodeParser>| -> Rc<dyn SubNodeParser> {
        expose_node_parser::new(chk.clone(), p, cfg.expose, cfg.js_doc)
    };
    let with_js_doc = |p: Rc<dyn SubNodeParser>| -> Rc<dyn SubNodeParser> {
        match cfg.js_doc {
            JsDocMode::Extended => annotated_node_parser::new(
                p,
                extended_annotations_reader::new(chk.clone(), extra_tags.clone(), cfg.markdown_description, cfg.full_description),
            ),
            JsDocMode::Basic => annotated_node_parser::new(p, basic_annotations_reader::new(extra_tags.clone())),
            JsDocMode::None => p,
        }
    };
    let with_circular = |p: Rc<dyn SubNodeParser>| -> Rc<dyn SubNodeParser> { CircularReferenceNodeParser::new(p) };

    chain
        .add_node_parser(hidden_type_node_parser::new())
        .add_node_parser(string_type_node_parser::new())
        .add_node_parser(symbol_type_node_parser::new())
        .add_node_parser(number_type_node_parser::new())
        .add_node_parser(boolean_type_node_parser::new())
        .add_node_parser(any_type_node_parser::new())
        .add_node_parser(unknown_type_node_parser::new())
        .add_node_parser(void_type_node_parser::new())
        .add_node_parser(undefined_type_node_parser::new())
        .add_node_parser(never_type_node_parser::new())
        .add_node_parser(object_type_node_parser::new())
        .add_node_parser(as_expression_node_parser::new(np()))
        .add_node_parser(binary_expression_node_parser::new(np()))
        .add_node_parser(satisfies_node_parser::new(np()))
        .add_node_parser(with_js_doc(parameter_parser::new(np())))
        .add_node_parser(string_literal_node_parser::new())
        .add_node_parser(string_template_literal_node_parser::new(np()))
        .add_node_parser(intrinsic_node_parser::new())
        .add_node_parser(number_literal_node_parser::new())
        .add_node_parser(boolean_literal_node_parser::new())
        .add_node_parser(null_literal_node_parser::new())
        .add_node_parser(object_literal_expression_node_parser::new(np(), chk.clone(), synth.clone()))
        .add_node_parser(array_literal_expression_node_parser::new(np()))
        .add_node_parser(prefix_unary_expression_node_parser::new(np()))
        .add_node_parser(literal_node_parser::new(np()))
        .add_node_parser(parenthesized_node_parser::new(np()))
        .add_node_parser(promise_node_parser::new(chk.clone(), np(), synth.clone()))
        .add_node_parser(type_reference_node_parser::new(chk.clone(), np(), synth.clone()))
        .add_node_parser(import_type_node_parser::new(chk.clone(), np()))
        .add_node_parser(expression_with_type_arguments_node_parser::new(chk.clone(), np()))
        .add_node_parser(indexed_access_type_node_parser::new(chk.clone(), as_node_parser(with_js_doc(sp()))))
        .add_node_parser(infer_type_node_parser::new())
        .add_node_parser(typeof_node_parser::new(chk.clone(), np()))
        .add_node_parser(mapped_type_node_parser::new(np(), cfg.additional_properties))
        .add_node_parser(conditional_type_node_parser::new(chk.clone(), np()))
        .add_node_parser(type_operator_node_parser::new(np()))
        .add_node_parser(union_node_parser::new(np()))
        .add_node_parser(intersection_node_parser::new(np()))
        .add_node_parser(tuple_node_parser::new(np()))
        .add_node_parser(named_tuple_member_node_parser::new(np()))
        .add_node_parser(optional_type_node_parser::new(np()))
        .add_node_parser(rest_type_node_parser::new(np()))
        .add_node_parser(identifier_node_parser::new(np(), chk.clone()))
        .add_node_parser(spread_element_node_parser::new(np()))
        .add_node_parser(call_expression_parser::new(chk.clone(), np(), synth.clone()))
        .add_node_parser(new_expression_parser::new(chk.clone(), np(), synth.clone()))
        .add_node_parser(property_access_expression_parser::new(chk.clone(), np()))
        .add_node_parser(with_circular(with_expose(with_js_doc(type_alias_node_parser::new(chk.clone(), np())))))
        .add_node_parser(with_expose(with_js_doc(enum_node_parser::new(chk.clone()))))
        .add_node_parser(with_circular(with_expose(with_js_doc(interface_and_class_node_parser::new(
            chk.clone(),
            as_node_parser(with_js_doc(sp())),
            cfg.additional_properties,
            synth.clone(),
        )))))
        .add_node_parser(with_circular(with_expose(with_js_doc(type_literal_node_parser::new(
            chk.clone(),
            as_node_parser(with_js_doc(sp())),
            cfg.additional_properties,
        )))))
        .add_node_parser(array_node_parser::new(np()));

    if cfg.functions != super::config::FunctionOptions::Fail {
        chain
            .add_node_parser(constructor_node_parser::new(np(), cfg.functions))
            .add_node_parser(function_node_parser::new(np(), cfg.functions));
    }

    let full_name = if cfg.types.len() == 1 { cfg.types[0].clone() } else { String::new() };
    TopRefNodeParser::new(np(), full_name, cfg.top_ref)
}

/// A SubNodeParser used where Go wants a NodeParser (`withJsDoc(chain)` is
/// passed as a child): a missing node is the chain's UnknownNodeError.
struct SubAsNode(Rc<dyn SubNodeParser>);

impl NodeParser for SubAsNode {
    fn create_type(&self, node: Option<tsrs_core::P<tsrs_ast::Node>>, ctx: &super::parser::Context, reference: Option<&super::types::Ty>) -> super::types::Ty {
        match node {
            Some(n) => self.0.create_type(n, ctx, reference),
            None => super::parser::unknown_node_error(None),
        }
    }
}

fn as_node_parser(p: Rc<dyn SubNodeParser>) -> Rc<dyn NodeParser> {
    Rc::new(SubAsNode(p))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tsjg::schema::to_value;
    use crate::tsjg::types::*;
    use serde_json::{Value, json};

    fn render(t: &Ty) -> String {
        let f = create_formatter(&Config::default());
        crate::jsjson::marshal(&to_value(&f.get_definition(t)), "").map(|b| String::from_utf8(b).unwrap()).unwrap()
    }

    #[test]
    fn object_with_optional_and_required() {
        let o = new_object_type(
            "o".into(),
            vec![],
            vec![
                ObjectProperty::new("a".into(), new(TypeKind::String { preserve_literals: false }), true),
                ObjectProperty::new("b".into(), new_union_type(&[new(TypeKind::Number), new(TypeKind::Undefined)]), true),
            ],
            Some(AdditionalProperties::Bool(false)),
            false,
        );
        assert_eq!(render(&o), r#"{"type":"object","properties":{"a":{"type":"string"},"b":{"type":"number"}},"required":["a"],"additionalProperties":false}"#);
    }

    #[test]
    fn literal_union_is_enum() {
        let lit = |s: &str| new(TypeKind::Literal(LiteralType { value: Value::String(s.into()) }));
        let u = new_union_type(&[lit("x"), lit("y")]);
        assert_eq!(render(&u), r#"{"type":"string","enum":["x","y"]}"#);
        let _ = json!(null);
    }

    #[test]
    fn nullable_annotated_string() {
        let a = new(TypeKind::Annotated(AnnotatedType {
            ty: new(TypeKind::String { preserve_literals: false }),
            annotations: serde_json::from_value(json!({"description":"d"})).unwrap(),
            nullable: true,
        }));
        assert_eq!(render(&a), r#"{"type":["string","null"],"description":"d"}"#);
    }

    #[test]
    fn tuple_uniform_becomes_array() {
        let n = || new(TypeKind::Number);
        let t = new_tuple_type(&[n(), n()]);
        assert_eq!(render(&t), r#"{"type":"array","items":{"type":"number"},"minItems":2,"maxItems":2}"#);
    }
}
