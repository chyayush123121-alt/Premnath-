export type SessionState =
  | "disconnected"
  | "connecting"
  | "listening"
  | "speaking";

export type AuraMood = "rose" | "amber" | "violet" | "ice";

export interface ExecutedAction {
  id: string;
  toolName: string;
  title: string;
  subtitle: string;
  url?: string;
  timestamp: number;
}

export interface LiveToolCall {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
}

export interface LiveToolResponse {
  id?: string;
  name: string;
  response: Record<string, unknown>;
}

export type ServerWsMessage =
  | { type: "connected" }
  | { type: "audio"; data: string; mimeType?: string }
  | { type: "interrupted" }
  | { type: "turn_complete" }
  | { type: "tool_call"; functionCalls: LiveToolCall[] }
  | { type: "closed"; reason?: string }
  | { type: "error"; message: string };
