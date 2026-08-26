/**
 * @fileoverview Shared helpers for MCP tool handlers.
 */

import { ApiError } from "../client.ts";

/** MCP tool result shape. */
type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

/**
 * Run an API call and render it as an MCP tool result.
 * Errors come back as readable text rather than a thrown exception, so the
 * model can react to a 403 instead of losing the turn.
 */
export async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    const data = await fn();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  } catch (error: any) {
    const detail =
      error instanceof ApiError
        ? `${error.message} (HTTP ${error.status})`
        : (error?.message ?? String(error));
    return {
      content: [{ type: "text", text: `Error: ${detail}` }],
      isError: true,
    };
  }
}

/** Drop undefined entries so a PATCH-style body carries only what changed. */
export function compact<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as T;
}
