//! Port of Go `tsjg/formatter/union_type_formatter.go`.

use std::rc::Rc;

use serde_json::{Map, Value};

use super::{TypeFormatter, unique_types};
use crate::tsjg::config::DiscriminatorType;
use crate::tsjg::fail;
use crate::tsjg::schema::{Def, Definition, Properties, def};
use crate::tsjg::types::{self, LiteralType, Ty, TypeKind, UnionType, stable_stringify};

pub struct UnionTypeFormatter {
    child_type_formatter: Rc<dyn TypeFormatter>,
    discriminator_type: DiscriminatorType,
}

impl UnionTypeFormatter {
    pub fn new(child_type_formatter: Rc<dyn TypeFormatter>, discriminator_type: DiscriminatorType) -> Rc<UnionTypeFormatter> {
        Rc::new(UnionTypeFormatter { child_type_formatter, discriminator_type })
    }

    fn get_type_definitions(&self, union_type: &UnionType) -> Vec<Def> {
        let mut definitions = Vec::new();
        for item in union_type.types() {
            if types::is_never_like(&types::deref_type(item)) {
                continue;
            }
            definitions.push(self.child_type_formatter.get_definition(item));
        }
        definitions
    }

    fn get_json_schema_discriminator_definition(&self, t: &Ty, union_type: &UnionType) -> Def {
        let definitions = self.get_type_definitions(union_type);
        let discriminator = union_type.discriminator.borrow().clone();

        if discriminator.is_empty() {
            fail(&format!("discriminator is undefined in type {}", t.name()));
        }

        let mut kind_types: Vec<Option<Ty>> = Vec::new();
        for item in union_type.types() {
            if types::is_never_like(&types::deref_type(item)) {
                continue;
            }
            let key = types::new(TypeKind::Literal(LiteralType { value: Value::String(discriminator.clone()) }));
            kind_types.push(types::get_type_by_key(item, &key));
        }

        for (i, item) in kind_types.iter().enumerate() {
            if item.is_none() {
                fail(&format!(
                    "cannot find discriminator keyword {:?} in type {}",
                    discriminator,
                    union_type.types()[i].name()
                ));
            }
        }

        let kind_definitions: Vec<Def> =
            kind_types.iter().map(|k| self.child_type_formatter.get_definition(k.as_ref().unwrap())).collect();

        let mut all_of: Vec<Def> = Vec::new();
        for i in 0..definitions.len() {
            let mut if_properties = Properties::new();
            if_properties.set(discriminator.clone(), kind_definitions[i].clone());
            all_of.push(def(Definition {
                if_: Some(def(Definition { properties: Some(if_properties), ..Definition::default() })),
                then: Some(definitions[i].clone()),
                ..Definition::default()
            }));
        }

        let mut kind_values: Vec<Value> = Vec::new();
        for item in &kind_definitions {
            let b = item.borrow();
            if let Some(c) = &b.const_ {
                kind_values.push(c.clone());
            } else if let Some(e) = &b.enum_ {
                kind_values.extend(e.iter().cloned());
            }
        }

        let mut duplicates: Vec<Value> = Vec::new();
        for (i, item) in kind_values.iter().enumerate() {
            for j in 0..i {
                if stable_stringify(&kind_values[j]) == stable_stringify(item) {
                    duplicates.push(item.clone());
                    break;
                }
            }
        }
        if !duplicates.is_empty() {
            let strs: Vec<String> = duplicates.iter().map(types::js_value_to_string).collect();
            fail(&format!("duplicate discriminator values: {} in type {:?}", strs.join(", "), t.name()));
        }

        let mut properties = Properties::new();
        properties.set(discriminator.clone(), def(Definition { enum_: Some(kind_values), ..Definition::default() }));

        def(Definition {
            properties: Some(properties),
            required: vec![discriminator],
            all_of: Some(all_of),
            ..Definition::with_type("object")
        })
    }

    fn get_open_api_discriminator_definition(&self, t: &Ty, union_type: &UnionType) -> Def {
        let one_of = self.get_type_definitions(union_type);
        let discriminator = union_type.discriminator.borrow().clone();

        if discriminator.is_empty() {
            fail(&format!("discriminator is undefined in type {}", t.name()));
        }

        let mut m = Map::new();
        m.insert("propertyName".into(), Value::String(discriminator.clone()));
        def(Definition {
            discriminator: Some(Value::Object(m)),
            required: vec![discriminator],
            one_of: Some(one_of),
            ..Definition::with_type("object")
        })
    }
}

impl TypeFormatter for UnionTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Union(_))
    }

    fn get_definition(&self, t: &Ty) -> Def {
        let TypeKind::Union(union_type) = &**t else { unreachable!() };

        if !union_type.discriminator.borrow().is_empty() {
            if self.discriminator_type == DiscriminatorType::OpenApi {
                return self.get_open_api_discriminator_definition(t, union_type);
            }
            return self.get_json_schema_discriminator_definition(t, union_type);
        }

        let definitions = self.get_type_definitions(union_type);

        // Flatten anyOf inside anyOf unless the anyOf has an annotation.
        let mut flattened: Vec<Def> = Vec::new();
        for d in definitions {
            let any_of = d.borrow().any_of.clone();
            match any_of {
                Some(list) if is_only_any_of(&d) => flattened.extend(list),
                _ => flattened.push(d),
            }
        }

        if flattened.len() > 1 {
            return def(Definition { any_of: Some(flattened), ..Definition::default() });
        }
        if flattened.len() == 1 {
            return flattened.remove(0);
        }
        // The TypeScript implementation returns undefined here; an empty
        // definition is the closest equivalent.
        def(Definition::default())
    }

    fn get_children(&self, t: &Ty) -> Vec<Ty> {
        let TypeKind::Union(u) = &**t else { unreachable!() };
        let mut children = Vec::new();
        for item in u.types() {
            children.extend(self.child_type_formatter.get_children(item));
        }
        unique_types(children)
    }
}

/// Whether anyOf is the definition's only key.
fn is_only_any_of(d: &Def) -> bool {
    let mut check = d.borrow().clone();
    check.any_of = None;
    check.is_empty()
}
