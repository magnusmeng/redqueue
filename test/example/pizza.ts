import type { IQuMessage } from "../../src/message";
import { defineQu } from "../../src/qu";
import { createTestRedisClient } from "../utils/redis-setup";

async function main() {
	async function handlePizzaOrder({
		ack,
		payload,
	}: IQuMessage<{ qty: number }>) {
		console.log(`Got an order of ${payload.qty} pizzas. Sending to kitchen!`);
		await Promise.all(
			new Array(payload.qty).fill(0).map(() =>
				qu.send("pizza.bake", {
					toppings: Math.random() > 0.5 ? ["pepperoni"] : ["cheese"],
				}),
			),
		);
		console.log("Sent out order to bakery");
		await ack();
	}

	async function bakePizza({
		ack,
		payload,
	}: IQuMessage<{ toppings: string[] }>) {
		console.log(`Baking pizza with ${payload.toppings.join(", ")}`);
		await qu.send("pizza.deliver", { to: "John Doe" });
		await ack();
	}

	async function deliverPizza({ ack, payload }: IQuMessage<{ to: string }>) {
		console.log(`Delivering pizza to ${payload.to}`);
		await ack();
	}

	const { client, redisServer } = await createTestRedisClient();
	const qu = defineQu(client, {
		"pizza.order": { handler: handlePizzaOrder },
		"pizza.bake": { handler: bakePizza },
		"pizza.deliver": { handler: deliverPizza },
	});
	console.log("Starting consumers");
	await qu.startConsumers();

	const produce = () => {
		void qu.send("pizza.order", { qty: 3 });
		setTimeout(() => produce(), Math.ceil(Math.random() * 10000));
	};
	produce();

	["SIGINT", "SIGTERM"].forEach((signal) =>
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		process.on(signal as any, () => {
			console.log("");
			console.log("Closing");
			void qu.stopConsumers();
			void client.disconnect();
			void redisServer.stop();
			process.exit(0);
		}),
	);

	console.log("Waiting on consumers. use ctrl-c to stop.");
	await qu.awaitConsumers();
}

void main();
