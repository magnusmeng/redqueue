import { IQuMessage } from '../../src/message';
import { defineQu } from '../../src/qu';
import { createTestRedisClient } from '../utils/redis-setup';

async function main() {
  async function handlePizzaOrder({
    ack,
    payload,
  }: IQuMessage<{ qty: number }>) {
    console.log(`Got an order of ${payload.qty} pizzas. Sending to kitchen!`);
    await Promise.all(
      new Array(payload.qty).fill(0).map(() =>
        qu.send('pizza.bake', {
          toppings: Math.random() > 0.5 ? ['pepperoni'] : ['cheese'],
        })
      )
    );
    console.log('Sent out order to bakery');
    await ack();
  }

  async function bakePizza({
    ack,
    payload,
  }: IQuMessage<{ toppings: string[] }>) {
    console.log(`Baking pizza with ${payload.toppings.join(', ')}`);
    await qu.send('pizza.deliver', { to: 'John Doe' });
    await ack();
  }

  async function deliverPizza({ ack, payload }: IQuMessage<{ to: string }>) {
    console.log(`Delivering pizza to ${payload.to}`);
    await ack();
  }

  const { client, redisServer } = await createTestRedisClient();
  const qu = defineQu(client, {
    'pizza.order': { handler: handlePizzaOrder },
    'pizza.bake': { handler: bakePizza },
    'pizza.deliver': { handler: deliverPizza },
  });

  await qu.startConsumers();

  await qu.send('pizza.order', { qty: 3 });

  await new Promise(resolve => setTimeout(resolve, 3000));

  await qu.stopConsumers();
  await client.disconnect();

  await redisServer.stop();
}

void main();
