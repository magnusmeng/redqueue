import { RedisClientType } from 'redis';
import { IQuMessage } from './message';
import { hostname } from 'os';

type RedisClient = RedisClientType<any, any, any>;

interface IQuConsumer {
  stop(): Promise<void>;
}

interface IConsumerOptions {
  key: string;
  group: string;
  concurrency: number;
}

export async function createConsumer<D>(
  client: RedisClient,
  handler: (message: IQuMessage<D>) => Promise<void>,
  { key, group, concurrency }: IConsumerOptions
): Promise<IQuConsumer> {
  let shouldStop = false;

  const consumer = `qu:consumer:${hostname()}`;

  const innerConsume = async () => {
    const raw = await client.xReadGroup(
      group,
      consumer,
      {
        key,
        id: '0', // Always look at the queue
      },
      {
        COUNT: concurrency,
        BLOCK: 1000, // Block for 1 second
      }
    );

    if (raw?.length === 1) {
      const items = raw[0].messages;
    }
    if (!shouldStop) await innerConsume();
  };

  // start consumer
  void innerConsume();

  return {
    async stop() {
      shouldStop = true;
    },
  };
}
