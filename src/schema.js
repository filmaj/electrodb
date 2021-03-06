const { KeyTypes, CastTypes } = require("./types");
const AttributeTypes = ["string", "number", "boolean", "enum"];

class Attribute {
	constructor(definition = {}) {
		this.name = definition.name;
		this.field = definition.field || definition.name;
		this.label = definition.label || "";
		this.readOnly = !!definition.readOnly;
		this.required = !!definition.required;
		this.cast = this._makeCast(definition.name, definition.cast);
		this.default = this._makeDefault(definition.default);
		this.validate = this._makeValidate(definition.validate);
		this.get = this._makeGet(definition.name, definition.get);
		this.set = this._makeSet(definition.name, definition.set);
		this.indexes = [...(definition.indexes || [])];
		let { type, enumArray } = this._makeType(this.name, definition.type);
		this.type = type;
		this.enumArray = enumArray;
	}

	_makeGet(name, get) {
		if (typeof get === "function") {
			return get;
		} else if (get === undefined) {
			return (attr) => attr;
		} else {
			throw new Error(
				`Invalid "get" property for attribure ${name}. Please ensure value is a function or undefined.`,
			);
		}
	}

	_makeSet(name, set) {
		if (typeof set === "function") {
			return set;
		} else if (set === undefined) {
			return (attr) => attr;
		} else {
			throw new Error(
				`Invalid "set" property for attribure ${name}. Please ensure value is a function or undefined.`,
			);
		}
	}

	_makeCast(name, cast) {
		if (cast !== undefined && !CastTypes.includes(cast)) {
			throw new Error(
				`Invalid "cast" property for attribute: "${name}". Acceptable types include ${CastTypes.join(
					", ",
				)}`,
			);
		} else if (cast === "string") {
			return (val) => {
				if (val === undefined) {
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
			return (val) => {
				if (val === undefined) {
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
			return (val) => val;
		}
	}

	_makeValidate(definition) {
		if (typeof definition === "function") {
			return (val) => {
				let reason = definition(val);
				return [!reason, reason || ""];
			};
		} else if (definition instanceof RegExp) {
			return (val) => {
				let isValid = definition.test(val);
				let reason = isValid ? "" : "Failed user defined regex";
				return [isValid, reason];
			};
		} else {
			return (val) => [true, ""];
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
		if (value === undefined) {
			return [!this.required, this.required ? "Value is required" : ""];
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
			let reason = [typeError, validationError].filter(Boolean).join(", ");
			return [isTyped && isValid, reason];
		} catch (err) {
			return [false, err.message];
		}
	}

	val(value) {
		value = this.cast(value);
		if (value === undefined) {
			value = this.default();
		}
		return value;
	}

	getValidate(value) {
		value = this.val(value);
		let [isValid, validationError] = this.isValid(value);
		if (!isValid) {
			throw new Error(
				`Invalid value for attribute "${this.name}": ${validationError}.`,
			);
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

	_validateProperties() {}

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
			if (attribute.field && facets.fields.includes(attribute.field)) {
				continue;
			}
			let isKey = !!facets.byIndex[""].all.find((facet) => facet.name === name);
			let definition = {
				name,
				label: facets.labels[name] || attribute.label,
				required: !!attribute.required,
				field: attribute.field || name,
				hide: !!attribute.hide,
				default: attribute.default,
				validate: attribute.validate,
				readOnly: !!attribute.readOnly || isKey,
				indexes: facets.byAttr[name] || [],
				type: attribute.type,
				get: attribute.get,
				set: attribute.set,
			};
			if (usedAttrs[definition.field] || usedAttrs[name]) {
				invalidProperties.push({
					name,
					property: "field",
					value: definition.field,
					expected: `Unique field property, already used by attribute ${
						usedAttrs[definition.field]
					}`,
				});
			} else {
				usedAttrs[definition.field] = definition.name;
			}
			translationForTable[definition.name] = definition.field;
			translationForRetrieval[definition.field] = definition.name;
			normalized[name] = new Attribute(definition);
		}
		let missingFacetAttributes = facets.attributes
			.filter(({ name }) => {
				return !normalized[name];
			})
			.map((facet) => `"${facet.type}: ${facet.name}"`);
		if (missingFacetAttributes.length) {
			throw new Error(
				`Invalid key facet template. The following facet attributes were described in the key facet template but were not included model's attributes: ${missingFacetAttributes.join(
					", ",
				)}`,
			);
		}
		if (invalidProperties.length) {
			let message = invalidProperties.map(
				(prop) =>
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

	applyAttributeGetters(payload = {}) {
		let attributes = { ...payload };
		for (let [name, value] of Object.entries(attributes)) {
			if (this.attributes[name] === undefined) {
				attributes[name] = value;
			} else {
				attributes[name] = this.attributes[name].get(value, { ...payload });
			}
		}
		return attributes;
	}

	applyAttributeSetters(payload = {}) {
		let attributes = { ...payload };
		for (let [name, value] of Object.entries(attributes)) {
			if (this.attributes[name] !== undefined) {
				attributes[name] = this.attributes[name].set(value, { ...payload });
			} else {
				attributes[name] = value;
			}
		}
		return attributes;
	}

	translateToFields(payload = {}) {
		let record = {};
		for (let [name, value] of Object.entries(payload)) {
			let field = this.translationForTable[name];
			if (value !== undefined) {
				record[field] = value;
			}
		}
		return record;
	}

	checkCreate(payload = {}) {
		let record = {};
		for (let attribute of Object.values(this.attributes)) {
			let value = payload[attribute.name];
			record[attribute.name] = attribute.getValidate(value);
		}
		return record;
	}

	checkUpdate(payload = {}) {
		let record = {};
		for (let attribute of Object.values(this.attributes)) {
			let value = payload[attribute.name];
			if (value === undefined) continue;
			if (attribute.readOnly) {
				throw new Error(
					`Attribute ${attribute.name} is Read-Only and cannot be updated`,
				);
			} else {
				record[attribute.name] = attribute.getValidate(value);
			}
		}
		return record;
	}

	getReadOnly() {
		return Object.values(this.attributes)
			.filter((attribute) => attribute.readOnly)
			.map((attribute) => attribute.name);
	}
}

module.exports = {
	Schema,
	Attribute,
	CastTypes,
};
