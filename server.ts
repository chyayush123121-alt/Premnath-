import "dotenv/config";
import http from "node:http";
import path from "node:path";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type Session,
} from "@google/genai";
import { MAHI_SYSTEM_INSTRUCTION, MAHI_TOOLS } from "./src/server/mahiPrompt.ts";

const PORT = Number(process.env.PORT || 3000);
const PRIMARY_LIVE_MODEL = "gemini-3.1-flash-live-preview";
const FALLBACK_LIVE_MODEL = "gemini-3.8-live";

const app = express();
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: PRIMARY_LIVE_MODEL });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

function safeSend(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

wss.on("connection", async (clientWs) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    safeSend(clientWs, {
      type: "error",
      message:
        "GEMINI_API_KEY is missing. Please add it in the Secrets panel.",
    });
    clientWs.close(1011, "Missing API key");
    return;
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: "v1beta",
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  let session: Session | null = null;
  let clientClosed = false;
  let sessionReady = false;

  const closeSession = () => {
    if (session) {
      try {
        session.close();
      } catch {
        // ignore close errors during teardown
      }
      session = null;
    }
    sessionReady = false;
  };

  clientWs.on("message", (rawData) => {
    if (clientClosed) return;
    let parsed: {
      type?: string;
      data?: string;
      functionResponses?: Array<{
        id?: string;
        name: string;
        response: Record<string, unknown>;
      }>;
    };

    try {
      parsed = JSON.parse(rawData.toString());
    } catch {
      return;
    }

    if (!session || !sessionReady) return;

    if (parsed.type === "audio" && typeof parsed.data === "string") {
      try {
        session.sendRealtimeInput({
          audio: {
            data: parsed.data,
            mimeType: "audio/pcm;rate=16000",
          },
        });
      } catch (err) {
        console.error("Failed to send audio input:", err);
      }
    } else if (
      parsed.type === "tool_response" &&
      Array.isArray(parsed.functionResponses)
    ) {
      try {
        session.sendToolResponse({
          functionResponses: parsed.functionResponses,
        });
      } catch (err) {
        console.error("Failed to send tool response:", err);
      }
    } else if (parsed.type === "disconnect") {
      closeSession();
    }
  });

  clientWs.on("close", () => {
    clientClosed = true;
    closeSession();
  });

  clientWs.on("error", () => {
    clientClosed = true;
    closeSession();
  });

  const connectWithModel = async (model: string): Promise<Session> => {
    let setupDone = false;
    return ai.live.connect({
      model,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Zephyr",
            },
          },
        },
        systemInstruction: MAHI_SYSTEM_INSTRUCTION,
        tools: MAHI_TOOLS,
      },
      callbacks: {
        onopen: () => {
          setupDone = true;
        },
        onmessage: (message: LiveServerMessage) => {
          if (clientClosed) return;

          if (message.serverContent?.interrupted) {
            safeSend(clientWs, { type: "interrupted" });
          }

          const parts = message.serverContent?.modelTurn?.parts ?? [];
          for (const part of parts) {
            if (part.inlineData?.data) {
              safeSend(clientWs, {
                type: "audio",
                data: part.inlineData.data,
                mimeType: part.inlineData.mimeType ?? "audio/pcm;rate=24000",
              });
            }
          }

          if (message.serverContent?.turnComplete) {
            safeSend(clientWs, { type: "turn_complete" });
          }

          const functionCalls = message.toolCall?.functionCalls;
          if (functionCalls && functionCalls.length > 0) {
            safeSend(clientWs, {
              type: "tool_call",
              functionCalls: functionCalls.map((call) => ({
                id: call.id,
                name: call.name,
                args: call.args ?? {},
              })),
            });
          }
        },
        onerror: (err: ErrorEvent) => {
          if (!setupDone || !sessionReady) return;
          console.error("Gemini Live session error:", err);
          if (!clientClosed) {
            safeSend(clientWs, {
              type: "error",
              message: err?.message || "Live voice session encountered an error.",
            });
          }
        },
        onclose: (event: CloseEvent) => {
          if (!sessionReady) return;
          sessionReady = false;
          if (!clientClosed) {
            safeSend(clientWs, {
              type: "closed",
              reason: event?.reason || "Session ended.",
            });
            clientWs.close();
          }
        },
      },
    });
  };

  try {
    try {
      session = await connectWithModel(PRIMARY_LIVE_MODEL);
    } catch (primaryErr) {
      const msg = primaryErr instanceof Error ? primaryErr.message : "";
      const isModelIssue =
        msg.includes("1008") ||
        msg.toLowerCase().includes("not found") ||
        msg.toLowerCase().includes("unsupported") ||
        msg.includes("404");

      if (!isModelIssue || clientClosed) {
        throw primaryErr;
      }

      console.warn(
        `Primary Live model (${PRIMARY_LIVE_MODEL}) unavailable, falling back to ${FALLBACK_LIVE_MODEL}:`,
        msg
      );
      session = await connectWithModel(FALLBACK_LIVE_MODEL);
    }

    if (clientClosed) {
      closeSession();
      return;
    }

    sessionReady = true;
    safeSend(clientWs, { type: "connected" });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to connect to Gemini Live.";
    console.error("Gemini Live connect error:", err);
    safeSend(clientWs, { type: "error", message });
    clientWs.close();
  }
});

server.on("upgrade", (request, socket, head) => {
  const reqUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);
  if (reqUrl.pathname === "/ws/live") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else if (process.env.NODE_ENV === "production") {
    socket.destroy();
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== "true",
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Mahi AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
