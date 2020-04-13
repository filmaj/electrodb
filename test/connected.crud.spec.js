const { Entity } = require("../src/entity");
const { expect } = require("chai");
const uuidv4 = require("uuid").v4;
const moment = require("moment");
const DynamoDB = require("aws-sdk/clients/dynamodb");
const client = new DynamoDB.DocumentClient({
	region: "us-east-1",
});
function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	})
}
let model = {
	service: "BugBeater",
	entity: "test",
	table: "electro",
	version: "1",
	attributes: {
		id: {
			type: "string",
			default: () => uuidv4(),
			field: "storeLocationId",
		},
		sector: {
			type: "string",
		},
		mall: {
			type: "string",
			required: true,
			field: "mallId",
		},
		store: {
			type: "string",
			required: true,
			field: "storeId",
		},
		building: {
			type: "string",
			required: true,
			field: "buildingId",
		},
		unit: {
			type: "string",
			required: true,
			field: "unitId",
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
				facets: ["sector"],
			},
			sk: {
				field: "sk",
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
	filters: {
		maxRent({ rent }, max) {
			return rent.lte(max);
		},
	},
};

describe("Entity", async () => {
	let MallStores = new Entity(model, { client });
	describe("Simple crud", async () => {
		let mall = "EastPointe";
		let store = "LatteLarrys";
		let sector = "A1";
		let category = "food/coffee";
		let leaseEnd = "2020-01-20";
		let rent = "0.00";
		let letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
		let building = "BuildingZ";
		let unit = "G1";
		it("Should return the created item", async () => {
			let putOne = await MallStores.put({
				sector,
				store,
				mall,
				rent,
				category,
				leaseEnd,
				unit,
				building,
			}).go();
			expect(putOne).to.deep.equal({
				id: putOne.id,
				sector,
				mall,
				store,
				building,
				unit,
				category,
				leaseEnd,
				rent,
			});
		}).timeout(20000);
		it("Should not collide with other keys", async () => {
			let sector = uuidv4();
			let malls = [uuidv4(), uuidv4()];
			let storeNames = [
				"ABC",
				"DEF",
				"GHI",
				"JKL",
				"MNO",
				"PQR",
				"STU",
				"WXY",
				"ZYX",
				"WUT",
			];
			let stores = [];
			for (let i = 0; i < storeNames.length; i++) {
				let mall = malls[i % 2];
				stores.push(
					MallStores.put({
						sector,
						mall,
						rent,
						category,
						leaseEnd,
						store: storeNames[i],
						unit: `B${i + 1}`,
						building: `Building${letters[i]}`,
					}).go(),
				);
			}
			stores = await Promise.all(stores);
			expect(stores)
				.to.be.an("array")
				.and.have.length(10);

			let mallOne = malls[0];
			let mallOneIds = stores
				.filter(store => store.mall === mallOne)
				.map(store => store.id);

			let mallOneStores = await MallStores.query
				.units({
					mall: mallOne,
				})
				.go();

			let mallOneMatches = mallOneStores.every(store =>
				mallOneIds.includes(store.id),
			);

			expect(mallOneMatches);
			expect(mallOneStores)
				.to.be.an("array")
				.and.have.length(5);

			let first = stores[0];
			let firstStore = await MallStores.get({
				sector,
				id: first.id,
			}).go();
			expect(firstStore).to.be.deep.equal(first);

			let buildingsAfterB = await MallStores.query
				.categories({ category, mall: mallOne })
				.gt({ building: "BuildingB" })
				.go();
			let buildingsAfterBStores = stores.filter(store => {
				return (
					store.mall === mallOne &&
					store.building !== "BuildingA" &&
					store.building !== "BuildingB"
				);
			});
			expect(buildingsAfterB).to.deep.equal(buildingsAfterBStores);

			let buildingsBetweenBH = await MallStores.query
				.categories({ category, mall: mallOne })
				.between({ building: "BuildingB" }, { building: "BuildingH" })
				.go();

			let buildingsBetweenBHStores = stores.filter(store => {
				return (
					store.mall === mallOne &&
					store.building !== "BuildingA" &&
					store.building !== "BuildingI"
				);
			});
			expect(buildingsBetweenBH)
				.to.be.an("array")
				.and.have.length(3)
				.and.to.be.deep.equal(buildingsBetweenBHStores);

			let secondStore = { sector, id: stores[1].id };
			let secondStoreBeforeUpdate = await MallStores.get(secondStore).go();
			let newRent = "5000.00";
			expect(secondStoreBeforeUpdate.rent)
				.to.equal(rent)
				.and.to.not.equal(newRent);
			let updatedStore = await MallStores.update(secondStore)
				.set({ rent: newRent })
				.go();
			expect(updatedStore).to.deep.equal({});
			let secondStoreAfterUpdate = await MallStores.get(secondStore).go();
			expect(secondStoreAfterUpdate.rent).to.equal(newRent);
		}).timeout(20000);
	});

	describe("Getters/Setters", async () => {
		let db = new Entity(
			{
				service: "testing",
				entity: uuidv4(),
				table: "electro",
				version: "1",
				attributes: {
					id: {
						type: "string",
						default: () => uuidv4(),
					},
					date: {
						type: "string",
						default: () => moment.utc().format(),
					},
					prop1: {
						type: "string",
						field: "prop1Field",
						set: (prop1, { id }) => {
							if (id) {
								return `${prop1} SET ${id}`;
							} else {
								return `${prop1} SET`;
							}
						},
						get: prop1 => `${prop1} GET`,
					},
					prop2: {
						type: "string",
						field: "prop2Field",
						get: (prop2, { id }) => `${prop2} GET ${id}`,
					},
				},
				indexes: {
					record: {
						pk: {
							field: "pk",
							facets: ["date"],
						},
						sk: {
							field: "sk",
							facets: ["id"],
						},
					},
				},
			},
			{ client },
		);

		it("Should show getter/setter values on put", async () => {
			let date = moment.utc().format();
			let id = uuidv4();
			let prop1 = "aaa";
			let prop2 = "bbb";
			let record = await db.put({ date, id, prop1, prop2 }).go();
			expect(record).to.deep.equal({
				id,
				date,
				prop1: `${prop1} SET ${id} GET`,
				prop2: `${prop2} GET ${id}`,
			});
			let fetchedRecord = await db.get({ date, id }).go();
			expect(fetchedRecord).to.deep.equal({
				id,
				date,
				prop1: `${prop1} SET ${id} GET`,
				prop2: `${prop2} GET ${id}`,
			});
			let updatedProp1 = "ZZZ";
			let updatedRecord = await db
				.update({ date, id })
				.set({ prop1: updatedProp1 })
				.go();
			expect(updatedRecord).to.deep.equal({});
			let getUpdatedRecord = await db.get({ date, id }).go();
			expect(getUpdatedRecord).to.deep.equal({
				id,
				date,
				prop1: "ZZZ SET GET",
				prop2: "bbb GET " + id,
			});
		}).timeout(20000);
	});
	describe("Query Options", async () => {
		let entity = uuidv4();
		let db = new Entity(
			{
				service: "testing",
				entity: entity,
				table: "electro",
				version: "1",
				attributes: {
					id: {
						type: "string",
					},
					date: {
						type: "string",
					},
					someValue: {
						type: "string",
						required: true,
						set: val => val + " wham",
						get: val => val + " bam",
					},
				},
				indexes: {
					record: {
						pk: {
							field: "pk",
							facets: ["date"],
						},
						sk: {
							field: "sk",
							facets: ["id"],
						},
					},
				},
			},
			{ client },
		);
		it("Should return the originally returned results", async () => {
			let id = uuidv4();
			let date = moment.utc().format();
			let someValue = "ABDEF";
			let putRecord = await db.put({ id, date, someValue }).go({ raw: true });
			expect(putRecord).to.deep.equal({});
			let getRecord = await db.get({ id, date }).go({ raw: true });
			expect(getRecord).to.deep.equal({
				Item: {
					id,
					date,
					someValue: someValue + " wham",
					sk: `$${entity}#id_${id}`.toLowerCase(),
					pk: `$testing_1#date_${date}`.toLowerCase(),
				},
			});
			let updateRecord = await db
				.update({ id, date })
				.set({ someValue })
				.go({ raw: true });
			expect(updateRecord).to.deep.equal({});
			let queryRecord = await db.query.record({ id, date }).go({ raw: true });
			expect(queryRecord).to.deep.equal({
				Items: [
					{
						id,
						date,
						someValue: someValue + " wham",
						sk: `$${entity}#id_${id}`.toLowerCase(),
						pk: `$testing_1#date_${date}`.toLowerCase(),
					},
				],
				Count: 1,
				ScannedCount: 1,
			});
		}).timeout(10000);
	});
	describe("Filters", async () => {
		it("Should filter results with custom user filter", async () => {
			let store = "LatteLarrys";
			let category = "food/coffee";
			let leaseEnd = "2020-01-20";
			let building = "BuildingA";
			let sector = uuidv4();
			let malls = [uuidv4(), uuidv4()];
			let mall = malls[0];
			let rent = "0";
			let storeNames = [
				"ABC",
				"DEF",
				"GHI",
				"JKL",
				"MNO",
				"PQR",
				"STU",
				"WXY",
				"ZYX",
				"WUT",
			];

			let stores = [];
			for (let i = 0; i < storeNames.length; i++) {
				let mall = malls[i % 2];
				stores.push(
					MallStores.put({
						mall,
						sector,
						building,
						category,
						leaseEnd,
						rent: i + rent,
						store: storeNames[i],
						unit: `B${i + 1}`,
					}).go(),
				);
			}

			stores = await Promise.all(stores);
			let max = "50";
			let filteredStores = stores.filter(store => {
				return store.mall === mall && store.rent <= max;
			});

			let belowMarketUnits = await MallStores.query
				.units({ mall, building })
				.maxRent(max)
				.go();

			expect(belowMarketUnits)
				.to.be.an("array")
				.and.have.length(3)
				.and.deep.have.members(filteredStores);
		}).timeout(20000);
		it("Should filter with the correct field name", async () => {
			let db = new Entity(
				{
					service: "testing",
					entity: uuidv4(),
					table: "electro",
					version: "1",
					attributes: {
						id: {
							type: "string",
							default: () => uuidv4(),
						},
						date: {
							type: "string",
							default: () => moment.utc().format(),
						},
						property: {
							type: "string",
							field: "propertyVal",
						},
					},
					indexes: {
						record: {
							pk: {
								field: "pk",
								facets: ["date"],
							},
							sk: {
								field: "sk",
								facets: ["id"],
							},
						},
					},
				},
				{ client },
			);
			let date = moment.utc().format();
			let property = "ABDEF";
			let recordParams = db.put({ date, property }).params();
			expect(recordParams.Item.propertyVal).to.equal(property);
			let record = await db.put({ date, property }).go();
			let found = await db.query
				.record({ date })
				.filter(attr => attr.property.eq(property))
				.go();
			let foundParams = db.query
				.record({ date })
				.filter(attr => attr.property.eq(property))
				.params();
			expect(foundParams.ExpressionAttributeNames["#property"]).to.equal(
				"propertyVal",
			);
			expect(found)
				.to.be.an("array")
				.and.have.length(1)
				.and.to.have.deep.members([record]);
		});
		it("Should allow for multiple filters", async () => {
			
			let entity = uuidv4();
			let id = uuidv4();
			let db = new Entity(
				{
					service: "testing",
					entity: entity,
					table: "electro",
					version: "1",
					attributes: {
						id: {
							type: "string",
						},
						property: {
							type: "string",
							field: "propertyVal",
						},
						color: {
							type: ["red", "green"],
						},
					},
					indexes: {
						record: {
							pk: {
								field: "pk",
								facets: ["id"],
							},
							sk: {
								field: "sk",
								facets: ["property"],
							},
						},
					},
				},
				{ client },
			);
			let date = moment.utc().format();
			let colors = ["red", "green"];
			let properties = ["A", "B", "C", "D", "E", "F"];
			let records = await Promise.all(
				properties.map((property, i) => {
					let color = colors[i % 2];
					return db.put({ id, property, color }).go();
				}),
			);
			let expectedMembers = records.filter(
				record => record.color !== "green" && record.property !== "A",
			);
			// sleep gives time for eventual consistency
			let found = await db.query.record({id})
				.filter(({ property }) => property.gt("A"))
				.filter(
					({ color, id }) => `
					(${color.notContains("green")} OR ${id.contains("weird_value")})
				`,
				)
				.filter(({ property }) => property.notContains("Z"))
				.go();

			expect(found)
				.to.be.an("array")
				.and.have.length(expectedMembers.length)
				.and.to.have.deep.members(expectedMembers);
		});
	});
});
