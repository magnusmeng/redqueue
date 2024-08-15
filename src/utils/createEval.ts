import { createHash } from "node:crypto";
import type { RedisClient } from "../interfaces";

function createSHA1(script: string) {
	return createHash("sha1").update(script, "utf8").digest("hex");
}

function isNoScriptError(err: Error) {
	return err.toString().includes("NOSCRIPT");
}

export default function createEval<Result>(script: string) {
	const sha1 = createSHA1(script);
	return async function optimizedEval(
		client: RedisClient,
		keys: string[],
		args: string[],
	): Promise<Result> {
		try {
			const res = await client.evalSha(sha1, {
				keys,
				arguments: args,
			});
			return res as Result;
		} catch (err) {
			if (isNoScriptError(err as Error)) {
				return client.eval(script, {
					keys,
					arguments: args,
				}) as Promise<Result>;
			}
			throw err;
		}
	};
}
