import { RedisClientType } from 'redis';
import { defineQu } from '../src/qu';
import { createTestRedisClient } from './utils/redis-setup';
import { IQuMessage } from '../src/message';

describe('Qu', () => {
  let client: RedisClientType<any, any, any>;
  beforeAll(async () => {
    ({ client } = await createTestRedisClient());
  });

  beforeEach(async () => {
    try {
      await client.xGroupDestroy('test:consumer', 'test-group');
    } catch {
      // noop
    }
  });
  it('should define consumers', async () => {
    const qu = defineQu(client, {
      testConsumer: {
        handler: async (message: IQuMessage<{ test: 'test' }>) => {
          await message.ack();
        },
      },
    });
    const consumers = await qu.setupConsumers();
    expect(Object.keys(consumers).length).toBe(1);
    expect(consumers.testConsumer).toBeDefined();
    expect(consumers.testConsumer.isConsuming).toBeTruthy();
    await consumers.testConsumer.stop();
    expect(consumers.testConsumer.isConsuming).toBeFalsy();
  });
  it('should send message', async () => {
    let received = false;
    const qu = defineQu(client, {
      testConsumer: {
        handler: async (message: IQuMessage<{ test: 'test' }>) => {
          await message.ack();
          received = true;
        },
      },
    });
    await qu.setupConsumers();
    await qu.send('testConsumer', { test: 'test' });
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(received).toBeTruthy();
    await qu.stopConsumers();
  });
});
