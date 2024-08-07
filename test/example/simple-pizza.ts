import { type IQuMessage, defineQu } from "../../src";
import { createTestRedisClient } from "../utils/redis-setup";

const redisOptions = {
	url: "redis://localhost:9876/0",
}; // Some redis connection options

const qu = defineQu(
	{ client: redisOptions },
	{
		"pizza.ordered": {
			handler: async (order: IQuMessage<{ qty: number }>) => {
				// Bake some pizzas
				for (let i = 0; i < order.payload.qty; i++) {
					await qu.send("pizza.bake", { topping: "cheese" });
				}
				await order.ack();
			},
			concurrency: 1, // Handle one order at a time
		},
		"pizza.bake": {
			handler: async (pizza: IQuMessage<{ topping: string }>) => {
				console.log(`Baking a ${pizza.payload.topping} pizza!`);
				await pizza.ack();
			},
			concurrency: 5, // The oven can bake 5 pizzas at a time
		},
	},
);

async function main() {
	const { client, redisServer } = await createTestRedisClient(9876);
	// Start the consumers
	await qu.startConsumers();

	console.log("Consumers are running! Stop with ctrl-c");

	// Send a pizza order each 1000ms
	const t = setInterval(() => {
		qu.send("pizza.ordered", { qty: 3 });
	}, 1000);

	// Await the consumers (e.g. run until they are stopped)
	await qu.awaitConsumers();
}

void main();
