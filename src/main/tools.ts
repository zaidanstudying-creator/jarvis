import { z } from "zod";
import type { ChatCompletionTool } from "groq-sdk/resources/chat/completions";
import type { Call } from "./providers/groq";
export interface Tool<T = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<T>;
  level: 0 | 1 | 2 | 3;
  run: (args: T, signal: AbortSignal) => Promise<unknown>;
}
export class ToolRegistry {
  private tools = new Map<string, Tool>();
  constructor(
    private authorize: (
      call: Call,
      level: number,
      args: unknown,
      signal: AbortSignal,
    ) => Promise<boolean>,
  ) {}
  register<T>(tool: Tool<T>) {
    if (this.tools.has(tool.name)) throw new Error("Duplicate tool");
    this.tools.set(tool.name, tool as Tool);
  }
  definitions(): ChatCompletionTool[] {
    return [...this.tools.values()].map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: z.toJSONSchema(t.schema) as Record<string, unknown>,
      },
    }));
  }
  async execute(call: Call, signal: AbortSignal) {
    signal.throwIfAborted();
    const tool = this.tools.get(call.name);
    if (!tool) throw new Error("Unknown tool.");
    if (!call.id || call.arguments.length > 65536)
      throw new Error("Invalid tool call.");
    const args = tool.schema.parse(JSON.parse(call.arguments));
    if (!(await this.authorize(call, tool.level, args, signal)))
      throw new Error("Tool permission denied.");
    signal.throwIfAborted();
    return tool.run(args, signal);
  }
}
