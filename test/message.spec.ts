import { RedisClientType } from 'redis';
import { createRawMessage, sendMessage } from '../src/message';
import { createTestRedisClient } from './utils/redis-setup';

describe('message', () => {
  let client: RedisClientType<any, any, any>;
  beforeAll(async () => {
    client = await createTestRedisClient();
  });

  it('should create a raw message', () => {
    const message = createRawMessage({
      id: 'test',
    });
    expect(JSON.parse(message.payload)).toMatchObject({ id: 'test' });
    expect(message.producer.includes('qu')).toBeTruthy();
    expect(message.version >= '0.0.0').toBeTruthy();
  });

  it('should send message', async () => {
    const rawMessage = createRawMessage({
      mesage: 'Hello world',
    });
    const message = await sendMessage(client, 'test-key-queue', {
      mesage: 'Hello world',
    });
    expect(message.id).toBeDefined();
    expect(message.payload).toBeDefined();
    const stream = await client.xInfoStream('test-key-queue');
    expect(stream.lastEntry?.id).toBe(message.id);
    expect(stream.lastEntry?.message).toMatchObject(rawMessage);
  });
});
