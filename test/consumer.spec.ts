import { RedisClientType } from 'redis';
import { createConsumer } from '../src/consumer';
import { createTestRedisClient } from './utils/redis-setup';
import { sendMessage } from '../src/message';

const asyncNoOp = async () => {
  // No op
};

describe('consumer', () => {
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

  it('should create a consumer', async () => {
    const consumer = await createConsumer(client, asyncNoOp, {
      concurrency: 1,
      group: 'test-group',
      key: 'test:consumer',
    });
    expect(consumer).toBeDefined();

    const groups = await client.xInfoGroups('test:consumer');
    expect(groups.length).toBe(1);
    expect(groups[0].name).toBe('test-group');
    expect(groups[0].consumers).toBe(1);

    // consumer.start();

    // await new Promise(resolve => setTimeout(resolve, 100));
    // await consumer.stop();
  });

  it('should not fail for multiple consumers', async () => {
    await createConsumer(client, asyncNoOp, {
      concurrency: 1,
      group: 'test-group',
      key: 'test:consumer',
      name: 'c1',
    });
    await createConsumer(client, asyncNoOp, {
      concurrency: 1,
      group: 'test-group',
      key: 'test:consumer',
      name: 'c2',
    });

    const groups = await client.xInfoGroups('test:consumer');
    expect(groups.length).toBe(1);
    expect(groups[0].name).toBe('test-group');
    expect(groups[0].consumers).toBe(2);
  });

  it('should start and stop a consumer', async () => {
    const consumer = await createConsumer(client, asyncNoOp, {
      concurrency: 1,
      group: 'test-group',
      key: 'test:consumer',
    });
    expect(consumer).toBeDefined();

    consumer.start();
    await new Promise(resolve => setTimeout(resolve, 100));
    await consumer.stop();

    // This test should pass silently and without timing out..
  });

  it('should consume messages', async () => {
    let received = 0;
    const consumer = await createConsumer<{ test: 'test' }>(
      client,
      message => {
        if (message.payload.test === 'test') {
          received++;
        }
      },
      {
        concurrency: 1,
        group: 'test-group',
        key: 'test:consumer',
        name: 'c1',
      }
    );
    consumer.start();
    await sendMessage(client, 'test:consumer', { test: 'test' });
    await new Promise(resolve => setTimeout(resolve, 30));
    await sendMessage(client, 'test:consumer', { test: 'test' });
    await new Promise(resolve => setTimeout(resolve, 30));
    await consumer.stop();
    expect(received).toBe(2);
  });
});
