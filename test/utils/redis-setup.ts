import { RedisMemoryServer } from 'redis-memory-server';
import { RedisClientType, createClient } from 'redis';

export const createTestRedisClient = async (): Promise<{
  client: RedisClientType<any, any, any>;
  redisServer: RedisMemoryServer;
}> => {
  const redisServer = new RedisMemoryServer();

  const host = await redisServer.getHost();
  const port = await redisServer.getPort();
  const client = createClient({
    url: `redis://${host}:${port}/0`,
  });
  await client.connect();
  return { client, redisServer };
};

// const host = await redisServer.getHost();
// const port = await redisServer.getPort();

// // `redis-server` has been started
// // you may use `host` and `port` as connection parameters for `ioredis` (or similar)

// // you may check instance status
// redisServer.getInstanceInfo(); // returns an object with instance data

// // you may stop `redis-server` manually
// await redisServer.stop();

// // when `redis-server` is killed, its running status should be `false`
// redisServer.getInstanceInfo();
