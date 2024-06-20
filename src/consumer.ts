import { RedisClientType } from 'redis';
import { IQuMessage, parseRawMessage } from './message';
import { hostname } from 'os';

type RedisClient = RedisClientType<any, any, any>;

export interface IQuConsumer {
  name: string;
  stop(): Promise<void>;
  start(): void;
  isConsuming: boolean;
}

interface IConsumerOptions {
  key: string;
  group: string;
  concurrency: number;
  name?: string;
}

export async function createConsumer<D>(
  client: RedisClient,
  handler: (message: IQuMessage<D>) => void | Promise<void>,
  { key, group, concurrency, name }: IConsumerOptions
): Promise<IQuConsumer> {
  let shouldStop = true;

  const consumerName = name ?? `qu:consumer:${hostname()}`;

  try {
    await client.xGroupCreate(key, group, '$', { MKSTREAM: true });
  } catch (error) {
    console.log(JSON.stringify(error));
    if (
      !(error as Error).message?.includes(
        'BUSYGROUP Consumer Group name already exist'
      )
    ) {
      throw error;
    }
  }
  await client.xGroupCreateConsumer(key, group, consumerName);

  const innerConsume = async () => {
    const raw = await client.xReadGroup(
      group,
      consumerName,
      { key, id: '>' },
      { COUNT: concurrency, BLOCK: 1000 }
    );

    if (raw?.length === 1) {
      const items = raw[0].messages;
      await Promise.all(
        items.map(async item => {
          try {
            await Promise.resolve(handler(parseRawMessage(item)));
          } catch (err) {
            // Handling message failed. Requeue it (reclaim it).
            console.error(
              'A message failed to be processed by your handler. You should ALWAYS catch application side errors yourself. The message will be reclaimed/requed.'
            );
          }
        })
      );
    }
    if (!shouldStop) await innerConsume();
  };

  let consumePromise: Promise<void>;

  return {
    name: consumerName,
    get isConsuming() {
      return !shouldStop;
    },
    async stop() {
      shouldStop = true;
      await consumePromise;
    },
    start() {
      // start consumer
      shouldStop = false;
      consumePromise = innerConsume();
    },
  };
}
