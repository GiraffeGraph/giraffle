import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { getDatabaseRuntimeEnv } from "@/lib/env.server";

let checkpointerPromise: Promise<PostgresSaver> | null = null;

export function getLangGraphCheckpointer(): Promise<PostgresSaver> {
  checkpointerPromise ??= (async () => {
    const database = getDatabaseRuntimeEnv();
    const checkpointer = PostgresSaver.fromConnString(database.url, {
      schema: "langgraph",
    });
    await checkpointer.setup();
    return checkpointer;
  })();

  return checkpointerPromise;
}
