const { KeyTypes } = require("./types");
const AttributeTypes = ["string", "number", "boolean", "enum"];
const CastTypes = ["string", "number"];

class Attribute {
	constructor(definition = {}) {
		this.name = definition.name;
		this.field = definition.field || definition.name;
		this.label = definition.label || definition.name;
		this.readOnly = !!definition.readOnly;
		this.required = !!definition.required;
		this.cast = this._makeCast(definition.name, definition.cast);
		this.default = this._makeDefault(definition.default);
		this.validate = this._makeValidate(definition.validate);
		this.indexes = [...(definition.indexes || [])];
		let { type, enumArray } = this._makeType(this.name, definition.type);
		this.type = type;
		this.enumArray = enumArray;
	}

	_makeCast(name, cast) {
		if (cast !== undefined && !CastTypes.includes(cast)) {
			throw new Error(
				`Invalid "cast" property for attribute: "${name}". Acceptable types include ${CastTypes.join(
					", ",
				)}`,
			);
		} else if (cast === "string") {
			return val => {
				if (typeof val === undefined) {
					throw new Error(
						`Attribute ${name} is undefined and cannot be cast to type ${cast}`,
					);
				} else if (typeof val === "string") {
					return val;
				} else {
					return String(val);
				}
			};
		} else if (cast === "number") {
			return val => {
				if (typeof val === undefined) {
					throw new Error(
						`Attribute ${name} is undefined and cannot be cast to type ${cast}`,
					);
				} else if (typeof val === "number") {
					return val;
				} else {
					let results = Number(val);
					if (isNaN(results)) {
						throw new Error(
							`Attribute ${name} cannot be cast to type ${cast}. Doing so results in NaN`,
						);
					} else {
						return results;
					}
				}
			};
		} else {
			return val => val;
		}
	}

	_makeValidate(definition) {
		if (typeof definition === "function") {
			return val => {
				let reason = definition(val);
				return [!reason, reason || ""];
			};
		} else if (definition instanceof RegExp) {
			return val => {
				let isValid = definition.test(val);
				let reason = isValid ? "" : "Failed user defined regex";
				return [isValid, reason];
			};
		} else {
			val => [true, ""];
		}
	}

	_makeDefault(definition) {
		if (typeof definition === "function") {
			return () => definition();
		} else {
			return () => definition;
		}
	}

	_makeType(name, definition) {
		let type = "";
		let enumArray = [];
		if (Array.isArray(definition)) {
			type = "enum";
			enumArray = [...definition];
		} else {
			type = definition || "string";
		}
		if (!AttributeTypes.includes(type)) {
			throw new Error(
				`Invalid "type" property for attribute: "${name}". Acceptable types include ${AttributeTypes.join(
					", ",
				)}`,
			);
		}
		return { type, enumArray };
	}

	_isType(value) {
		if (val === undefined) {
			return [this.required, this.required ? "" : "Value is required"];
		} else if (this.type === "enum") {
			let isIncluded = this.enumArray.includes(value);
			let reason = isIncluded
				? ""
				: `Value not found in set of acceptable values: ${this.enumArray.join(
						", ",
				  )}`;
			return [isIncluded, reason];
		} else {
			let isTyped = typeof value === this.type;
			let reason = isTyped
				? ""
				: `Received value of type ${typeof value}, expected value of type ${
						this.type
				  }`;
			return [isTyped, reason];
		}
	}

	isValid(value) {
		try {
			let [isTyped, typeError] = this._isType(value);
			let [isValid, validationError] = this.validate(value);
			let reason = [typeError, validationError].join(", ");
			return [isTyped && isValid, reason];
		} catch (err) {
			return [false, err.message];
		}
	}

	val(value) {
		value = this.cast(value);
		if (typeof value === undefined) {
			value = this.default();
		}
		let [isValid, validationError] = this.isValid(value);
		if (!isValid) {
			throw new Error(`Invalid attribute ${this.name}: ${validationError}`);
		}
		return value;
	}
}

class Schema {
	constructor(properties = {}, facets = {}) {
		this._validateProperties(properties);
		let schema = this._normalizeAttributes(properties, facets);
		this.attributes = schema.attributes;
		this.enums = schema.enums;
		this.translationForTable = schema.translationForTable;
		this.translationForRetrieval = schema.translationForRetrieval;
	}

	_normalizeAttributes(attributes = {}, facets = {}) {
		let invalidProperties = [];
		let normalized = {};
		let usedAttrs = {};
		let enums = {};
		let translationForTable = {};
		let translationForRetrieval = {};

		for (let name in attributes) {
			let attribute = attributes[name];
			if (facets.fields.includes(name)) {
				continue;
			}
			if (attribute.attr && facets.fields.includes(attribute.attr)) {
				continue;
			}
			let isPk = !!facets.byType[KeyTypes.pk].find(
				facet => facet.name === name,
			);
			let definition = {
				name,
				required: !!attribute.required,
				attr: attribute.attr || name,
				hide: !!attribute.hide,
				default: attribute.default,
				validate: attribute.validate,
				readOnly: !!attribute.readOnly || isPk,
				indexes: facets.byAttr[name] || [],
			};
			if (usedAttrs[definition.attr] || usedAttrs[name]) {
				invalidProperties.push({
					name,
					property: "attr",
					value: definition.attr,
					expected: `Unique attr property, already used by attribute ${
						usedAttrs[definition.attr]
					}`,
				});
			} else {
				usedAttrs[definition.attr] = definition.name;
			}
			translationForTable[definition.name] = definition.attr;
			translationForRetrieval[definition.attr] = definition.name;
			normalized[name] = new Attribute(definition);
		}
		if (invalidProperties.length) {
			let message = invalidProperties.map(
				prop =>
					`Schema Validation Error: Attribute "${prop.name}" property "${prop.property}". Received: "${prop.value}", Expected: "${prop.expected}"`,
			);
			throw new Error(message);
		} else {
			return {
				enums,
				translationForTable,
				translationForRetrieval,
				attributes: normalized,
			};
		}
	}

	_validateProperties(properties) {}
}

module.exports = {
	Schema,
	Attribute,
};