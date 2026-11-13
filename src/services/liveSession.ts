import { AudioStreamer } from "./audioStreamer";
import type {
  AuraMood,
  ExecutedAction,
  LiveToolCall,
  LiveToolResponse,
  ServerWsMessage,
  SessionState,
} from "../types/voice";

export interface LiveSessionCallbacks {
  onStateChange: (state: SessionState) => void;
  onActionExecuted: (action: ExecutedAction) => void;
  onMoodChange: (mood: AuraMood) => void;
  onError: (message: string | null) => void;
  onMicMuteChange?: (muted: boolean) => void;
  onSpeakerMuteChange?: (muted: boolean) => void;
}

function normalizeHttpUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function triggerSafeBrowserNavigation(url: string): boolean {
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return true;
  } catch {
    return false;
  }
}

export class LiveSession {
  private callbacks: LiveSessionCallbacks;
  private ws: WebSocket | null = null;
  private audioStreamer: AudioStreamer | null = null;
  private state: SessionState = "disconnected";
  private micMuted = false;
  private speakerMuted = false;
  private intentionalDisconnect = false;

  constructor(callbacks: LiveSessionCallbacks) {
    this.callbacks = callbacks;
  }

  public getState(): SessionState {
    return this.state;
  }

  public getAudioLevel(
    channel: "input" | "output",
    bins?: Uint8Array<ArrayBuffer>
  ): number {
    if (!this.audioStreamer) {
      if (bins) bins.fill(0);
      return 0;
    }
    return this.audioStreamer.getVisualizationLevel(channel, bins);
  }

  public getFrequencyBinCount(): number {
    return this.audioStreamer?.getFrequencyBinCount() ?? 128;
  }

  private setState(nextState: SessionState): void {
    if (this.state !== nextState) {
      this.state = nextState;
      this.callbacks.onStateChange(nextState);
    }
  }

  public async connect(): Promise<void> {
    if (this.state !== "disconnected") return;

    this.intentionalDisconnect = false;
    this.micMuted = false;
    this.speakerMuted = false;
    this.callbacks.onMicMuteChange?.(false);
    this.callbacks.onSpeakerMuteChange?.(false);
    this.callbacks.onError(null);
    this.setState("connecting");

    const streamer = new AudioStreamer({
      onAudioChunk: (base64Pcm16) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: "audio", data: base64Pcm16 }));
        }
      },
      onPlaybackStateChange: (isPlaying) => {
        if (this.state === "disconnected" || this.state === "connecting") {
          return;
        }
        this.setState(isPlaying ? "speaking" : "listening");
      },
      onError: (msg) => {
        this.callbacks.onError(msg);
      },
    });

    this.audioStreamer = streamer;

    try {
      await streamer.prepare();
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access was denied. Enable mic permissions to talk with Mahi."
          : "Could not initialize microphone audio.";
      this.cleanup();
      this.callbacks.onError(msg);
      return;
    }

    if (this.intentionalDisconnect) {
      this.cleanup();
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/live`;

    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onmessage = async (event) => {
        let msg: ServerWsMessage;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        switch (msg.type) {
          case "connected":
            await this.audioStreamer?.startCapture();
            if (!this.intentionalDisconnect && this.state === "connecting") {
              this.setState("listening");
            }
            break;

          case "audio":
            this.audioStreamer?.enqueueAudio(msg.data);
            break;

          case "interrupted":
            this.audioStreamer?.stopPlayback();
            if (this.state === "speaking") {
              this.setState("listening");
            }
            break;

          case "tool_call":
            this.handleToolCalls(msg.functionCalls);
            break;

          case "error":
            this.callbacks.onError(msg.message);
            break;

          case "closed":
            if (!this.intentionalDisconnect) {
              this.cleanup();
            }
            break;
        }
      };

      ws.onerror = () => {
        if (!this.intentionalDisconnect) {
          this.callbacks.onError("Voice connection failed. Please try again.");
          this.cleanup();
        }
      };

      ws.onclose = () => {
        if (!this.intentionalDisconnect && this.state !== "disconnected") {
          this.cleanup();
        }
      };
    } catch {
      this.callbacks.onError("Unable to open voice socket.");
      this.cleanup();
    }
  }

  private handleToolCalls(calls: LiveToolCall[]): void {
    const functionResponses: LiveToolResponse[] = calls.map((call) => {
      const name = call.name || "unknown";
      const args = call.args ?? {};

      if (name === "openWebsite") {
        const rawUrl = String(args.url ?? "");
        const siteName = String(args.siteName ?? rawUrl ?? "Website");
        const safeUrl = normalizeHttpUrl(rawUrl);

        if (!safeUrl) {
          return {
            id: call.id,
            name,
            response: {
              success: false,
              error: "Invalid URL provided.",
            },
          };
        }

        const launched = triggerSafeBrowserNavigation(safeUrl);
        this.callbacks.onActionExecuted({
          id: call.id || `${Date.now()}`,
          toolName: "openWebsite",
          title: siteName,
          subtitle: new URL(safeUrl).hostname.replace(/^www\./, ""),
          url: safeUrl,
          timestamp: Date.now(),
        });

        return {
          id: call.id,
          name,
          response: {
            success: true,
            launchedInNewTab: launched,
            siteName,
            url: safeUrl,
          },
        };
      }

      if (name === "searchWeb") {
        const query = String(args.query ?? "").trim();
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        const launched = triggerSafeBrowserNavigation(searchUrl);

        this.callbacks.onActionExecuted({
          id: call.id || `${Date.now()}`,
          toolName: "searchWeb",
          title: `Search: ${query}`,
          subtitle: "google.com",
          url: searchUrl,
          timestamp: Date.now(),
        });

        return {
          id: call.id,
          name,
          response: {
            success: true,
            launchedInNewTab: launched,
            query,
            url: searchUrl,
          },
        };
      }

      if (name === "setAuraMood") {
        const rawMood = String(args.mood ?? "rose").toLowerCase();
        const validMoods: AuraMood[] = ["rose", "amber", "violet", "ice"];
        const mood: AuraMood = validMoods.includes(rawMood as AuraMood)
          ? (rawMood as AuraMood)
          : "rose";
        this.callbacks.onMoodChange(mood);

        return {
          id: call.id,
          name,
          response: {
            success: true,
            activeMood: mood,
          },
        };
      }

      if (name === "getCurrentTime") {
        const now = new Date();
        return {
          id: call.id,
          name,
          response: {
            localTime: now.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            localDate: now.toLocaleDateString([], {
              weekday: "long",
              month: "short",
              day: "numeric",
            }),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        };
      }

      return {
        id: call.id,
        name,
        response: {
          success: false,
          error: `Unsupported tool: ${name}`,
        },
      };
    });

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "tool_response",
          functionResponses,
        })
      );
    }
  }

  public interrupt(): void {
    this.audioStreamer?.stopPlayback();
    if (this.state === "speaking") {
      this.setState("listening");
    }
  }

  public toggleMicMute(): boolean {
    this.micMuted = !this.micMuted;
    this.audioStreamer?.setMicMuted(this.micMuted);
    this.callbacks.onMicMuteChange?.(this.micMuted);
    return this.micMuted;
  }

  public toggleSpeakerMute(): boolean {
    this.speakerMuted = !this.speakerMuted;
    this.audioStreamer?.setSpeakerMuted(this.speakerMuted);
    this.callbacks.onSpeakerMuteChange?.(this.speakerMuted);
    return this.speakerMuted;
  }

  public disconnect(): void {
    this.intentionalDisconnect = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "disconnect" }));
      } catch {
        // ignore send errors on disconnect
      }
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.ws) {
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }

    if (this.audioStreamer) {
      this.audioStreamer.dispose();
      this.audioStreamer = null;
    }

    this.micMuted = false;
    this.speakerMuted = false;
    this.callbacks.onMicMuteChange?.(false);
    this.callbacks.onSpeakerMuteChange?.(false);
    this.setState("disconnected");
  }
}
