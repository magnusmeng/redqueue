import { RedisClientType } from 'redis';

class QuRedis {
  constructor(private readonly client: RedisClientType) {}
}

class Message {
  async ack(): Promise<void> {
    // Ack this message
  }
}

class Consumer {}

function consume(key: string, group: string) {
  // TODO: Start a consumer on the key and consumer group
  // TODO: Create messages
}
