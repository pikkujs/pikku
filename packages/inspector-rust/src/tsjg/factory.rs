//! Port of Go `tsjg/factory/wiring.go`: wiring of the parser and formatter
//! chains. Registration order is load-bearing: the first parser or formatter
//! whose `supports_*` matches wins.

use std::rc::Rc;

use super::config::Config;
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

/// TEMPORARY until the parser forks are merged.
pub fn create_parser(_chk: super::parser::Chk, _cfg: &Config) -> Rc<dyn super::parser::NodeParser> {
    super::fail("create_parser: parsers not wired yet")
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
