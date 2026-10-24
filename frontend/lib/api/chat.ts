import { apiHeaders, apiUrl } from "./client";

export type ChatHistoryItem = { role: "user" | "assistant"; content: string };

export async function askKody(message: string, history: ChatHistoryItem[], signal: AbortSignal): Promise<string> {
  const response = await fetch(apiUrl("/chat"), {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ message, history }),
    credentials: "omit",
    signal,
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error("Kody is getting a lot of messages. Please try again shortly.");
    if (response.status === 503) throw new Error("Kody is unavailable right now. Please try again later.");
    if (response.status === 413 || response.status === 422) throw new Error("That message is too long. Please shorten it and try again.");
    throw new Error("Kody could not answer right now. Please try again.");
  }
  const data = await response.json() as { reply?: unknown };
  if (typeof data.reply !== "string" || !data.reply.trim()) throw new Error("Kody did not return an answer. Please retry.");
  return data.reply;
}
