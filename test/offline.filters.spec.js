const moment = require("moment");
const uuidV4 = require("uuid/v4");
const { expect } = require("chai");
let { Entity } = require("../src/entity");
let { FilterFactory, FilterTypes } = require("../src/filters");

let model = {
	service: "MallStoreDirectory",
	entity: "MallStores",
	table: "StoreDirectory",
	version: "1",
	attributes: {
		id: {
			type: "string",
			default: () => uuidV4(),
			facets: "storeLocationId",
		},
		mall: {
			type: "string",
			required: true,
			facets: "mallId",
		},
		store: {
			type: "string",
			required: true,
			facets: "storeId",
		},
		building: {
			type: "string",
			required: true,
			facets: "buildingId",
		},
		unit: {
			type: "string",
			required: true,
			facets: "unitId",
		},
		category: {
			type: [
				"food/coffee",
				"food/meal",
				"clothing",
				"electronics",
				"department",
				"misc",
			],
			required: true,
		},
		leaseEnd: {
			type: "string",
			required: true,
			validate: date =>
				moment(date, "YYYY-MM-DD").isValid() ? "" : "Invalid date format",
		},
		rent: {
			type: "string",
			required: false,
			default: "0.00",
		},
		adjustments: {
			type: "string",
			required: false,
		},
	},
	indexes: {
		store: {
			pk: {
				field: "pk",
				facets: ["id"],
			},
		},
		units: {
			index: "gsi1pk-gsi1sk-index",
			pk: {
				field: "gsi1pk",
				facets: ["mall"],
			},
			sk: {
				field: "gsi1sk",
				facets: ["building", "unit", "store"],
			},
		},
		leases: {
			index: "gsi2pk-gsi2sk-index",
			pk: {
				field: "gsi2pk",
				facets: ["mall"],
			},
			sk: {
				field: "gsi2sk",
				facets: ["leaseEnd", "store", "building", "unit"],
			},
		},
		categories: {
			index: "gsi3pk-gsi3sk-index",
			pk: {
				field: "gsi3pk",
				facets: ["mall"],
			},
			sk: {
				field: "gsi3sk",
				facets: ["category", "building", "unit", "store"],
			},
		},
		shops: {
			index: "gsi4pk-gsi4sk-index",
			pk: {
				field: "gsi4pk",
				facets: ["store"],
			},
			sk: {
				field: "gsi4sk",
				facets: ["mall", "building", "unit"],
			},
		},
	},
};

describe("Filter", () => {
	describe("Clause Building", () => {
		let MallStores = new Entity(model);
		it("Should build a clause", () => {
			function rentsLeaseEndFilter(
				{ rent, leaseEnd, mall } = {},
				{ lowRent, beginning, end, location } = {},
			) {
				return `(${rent.gte(lowRent)} AND ${mall.eq(
					location,
				)}) OR ${leaseEnd.between(beginning, end)}`;
			}
			let filter = new FilterFactory(
				MallStores.model.schema.attributes,
				FilterTypes,
			);
			let clause = filter.buildClause(rentsLeaseEndFilter);
			let lowRent = "20.00";
			let beginning = "20200101";
			let end = "20200401";
			let location = "EastPointe";
			let results = clause(
				MallStores,
				{ query: { filter: {} } },
				{ lowRent, beginning, end, location },
			);
			expect(results).to.deep.equal({
				query: {
					filter: {
						ExpressionAttributeNames: {
							"#rent": "rent",
							"#mall": "mall",
							"#leaseEnd": "leaseEnd",
						},
						ExpressionAttributeValues: {
							":rent1": "20.00",
							":mall1": "EastPointe",
							":leaseEnd1": "20200101",
							":leaseEnd2": "20200401",
						},
						valueCount: { rent: 2, mall: 2, leaseEnd: 3 },
						FilterExpression:
							"(#rent >= :rent1 AND #mall = :mall1) OR (#leaseEnd between :leaseEnd1 and :leaseEnd2)",
					},
				},
			});
		});
		it("Shouldnt validate the attributes passed when not strict", () => {
			function byCategory(attr, { category }) {
				return attr.category.contains(category);
			}
			let filter = new FilterFactory(
				MallStores.model.schema.attributes,
				FilterTypes,
			);
			let clause = filter.buildClause(byCategory);
			let category = "food";
				
			let containsFood = clause(MallStores, { query: { filter: {} } }, { category });
			expect(containsFood).to.deep.equal({
				query: {
					filter: {
						ExpressionAttributeNames: { '#category': 'category' },
						ExpressionAttributeValues: { ':category1': 'food' },
						valueCount: { category: 2 },
						FilterExpression: 'contains(#category, :category1)'
					}
				}
			})
		});
		it("Should not allow filters named 'go', 'params', or 'filter'", () => {
			let schema = {
				service: "MallStoreDirectory",
				entity: "MallStores",
				table: "StoreDirectory",
				version: "1",
				attributes: {
					id: {
						type: "string",
						default: () => uuidV4(),
						facets: "storeLocationId",
					},
				},
				indexes: {
					record: {
						pk: {
							field: "pk",
							facets: ["id"],
						},
					},
				},
				filters: {},
			};
			schema.filters = { go: () => "" };
			expect(() => new Entity(schema)).to.throw(
				`Invalid filter name. Filter cannot be named "go", "params", or "filter"`,
			);
			schema.filters = { params: () => "" };
			expect(() => new Entity(schema)).to.throw(
				`Invalid filter name. Filter cannot be named "go", "params", or "filter"`,
			);
			schema.filters = { filter: () => "" };
			expect(() => new Entity(schema)).to.throw(
				`Invalid filter name. Filter cannot be named "go", "params", or "filter"`,
			);
		});
	});
});
