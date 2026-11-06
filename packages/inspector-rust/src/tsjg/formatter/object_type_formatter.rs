//! Port of Go `tsjg/formatter/object_type_formatter.go`.

use std::rc::Rc;


use super::all_of_definition::reduce_all_of;
use super::{TypeFormatter, unique_types};
use crate::tsjg::schema::{Additional, Def, Definition, Properties, def};
use crate::tsjg::types::{self, AdditionalProperties, ObjectProperty, Ty, TypeKind};

pub struct ObjectTypeFormatter {
    child_type_formatter: Rc<dyn TypeFormatter>,
}

impl ObjectTypeFormatter {
    pub fn new(child_type_formatter: Rc<dyn TypeFormatter>) -> Rc<ObjectTypeFormatter> {
        Rc::new(ObjectTypeFormatter { child_type_formatter })
    }

    fn get_object_definition(&self, object_type: &types::ObjectType) -> Def {
        let additional_properties = &object_type.additional_properties;
        let is_false = matches!(additional_properties, Some(AdditionalProperties::Bool(false)));

        let object_properties: Vec<&ObjectProperty> = if is_false {
            object_type.properties.iter().filter(|p| !types::is_never_like(&types::deref_type(&p.ty))).collect()
        } else {
            object_type.properties.iter().collect()
        };

        let prepared: Vec<PreparedProperty> = object_properties.iter().map(|p| self.prepare_object_property(p)).collect();

        let mut required = Vec::new();
        for p in &prepared {
            if p.required {
                required.push(p.name.clone());
            }
        }

        let mut properties = Properties::new();
        for p in &prepared {
            properties.set(p.name.clone(), self.child_type_formatter.get_definition(&p.ty));
        }

        let mut definition = Definition::with_type("object");
        if properties.len() > 0 {
            definition.properties = Some(properties);
        }
        if !required.is_empty() {
            definition.required = required;
        }

        match additional_properties {
            Some(AdditionalProperties::Bool(ap)) => {
                if !*ap {
                    definition.additional_properties = Some(Additional::Bool(false));
                }
            }
            Some(AdditionalProperties::Type(ap)) => match &**ap {
                // Omitted, like additionalProperties === true.
                TypeKind::Any | TypeKind::Symbol => {}
                _ => definition.additional_properties = Some(Additional::Def(self.child_type_formatter.get_definition(ap))),
            },
            None => {}
        }

        def(definition)
    }

    fn prepare_object_property(&self, property: &ObjectProperty) -> PreparedProperty {
        let property_type = property.ty.clone();
        let prop_type = types::deref_type(&property_type);

        if matches!(&*prop_type, TypeKind::Undefined) {
            return PreparedProperty { name: types::strip_quotes(&property.name()), ty: property_type, required: false };
        }
        let TypeKind::Union(union_type) = &*prop_type else {
            return PreparedProperty { name: property.name(), ty: property_type, required: property.required };
        };

        let (num_removed, new_prop_type) = types::remove_undefined(union_type);
        if num_removed == 0 {
            return PreparedProperty { name: property.name(), ty: property_type, required: property.required };
        }
        PreparedProperty { name: types::strip_quotes(&property.name()), ty: types::preserve_annotation(&property_type, new_prop_type), required: false }
    }
}

struct PreparedProperty {
    name: String,
    ty: Ty,
    required: bool,
}

impl TypeFormatter for ObjectTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Object(_))
    }

    fn get_definition(&self, t: &Ty) -> Def {
        let TypeKind::Object(object_type) = &**t else { unreachable!() };
        let mut definition = self.get_object_definition(object_type);
        for base_type in &object_type.base_types {
            definition = reduce_all_of(&self.child_type_formatter, definition, base_type);
        }
        definition
    }

    fn get_children(&self, t: &Ty) -> Vec<Ty> {
        let TypeKind::Object(object_type) = &**t else { unreachable!() };
        let mut children = Vec::new();

        for base_type in &object_type.base_types {
            children.extend(self.child_type_formatter.get_children(base_type));
        }
        if let Some(AdditionalProperties::Type(ap)) = &object_type.additional_properties {
            children.extend(self.child_type_formatter.get_children(ap));
        }
        for property in &object_type.properties {
            if types::is_never_like(&property.ty) {
                continue;
            }
            children.extend(self.child_type_formatter.get_children(&property.ty));
        }
        unique_types(children)
    }
}

