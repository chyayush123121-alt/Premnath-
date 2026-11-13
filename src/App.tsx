import { useCallback, useEffect, useRef, useState } from "react";
import {
  Compass,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Volume2,
  VolumeX,
  AlertCircle,
  X,
} from "lucide-react";
import { AcousticCoreCanvas } from "./components/AcousticCoreCanvas";
import { ActionBanner } from "./components/ActionBanner";
import { VoiceCapabilitiesSheet } from "./components/VoiceCapabilitiesSheet";
import { LiveSession } from "./services/liveSession";
import type { AuraMood, ExecutedAction, SessionState } from "./types/voice";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function App() {
  const [sessionState, setSessionState] = useState<SessionState>("disconnected");
  const [mood, setMood] = useState<AuraMood>("rose");
  const [micMuted, setMicMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ExecutedAction | null>(null);
  const [recentActions, setRecentActions] = useState<ExecutedAction[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const sessionRef = useRef<LiveSession | null>(null);
  const actionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const live = new LiveSession({
      onStateChange: (next) => {
        setSessionState(next);
        if (next === "disconnected") {
          setMood("rose");
        }
      },
      onActionExecuted: (action) => {
        setActiveAction(action);
        setRecentActions((prev) => [action, ...prev].slice(0, 8));
        if (actionTimerRef.current) {
          window.clearTimeout(actionTimerRef.current);
        }
        actionTimerRef.current = window.setTimeout(() => {
          setActiveAction(null);
        }, 7000);
      },
      onMoodChange: (nextMood) => {
        setMood(nextMood);
      },
      onError: (msg) => {
        setError(msg);
      },
      onMicMuteChange: (muted) => {
        setMicMuted(muted);
      },
      onSpeakerMuteChange: (muted) => {
        setSpeakerMuted(muted);
      },
    });

    sessionRef.current = live;

    return () => {
      if (actionTimerRef.current) {
        window.clearTimeout(actionTimerRef.current);
      }
      live.disconnect();
      sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (sessionState !== "listening" && sessionState !== "speaking") {
      setElapsedSeconds(0);
      return;
    }

    const interval = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [sessionState]);

  const handlePrimaryToggle = useCallback(() => {
    const live = sessionRef.current;
    if (!live) return;

    if (sessionState === "disconnected") {
      setError(null);
      void live.connect();
    } else {
      live.disconnect();
    }
  }, [sessionState]);

  const handleOrbTap = useCallback(() => {
    const live = sessionRef.current;
    if (!live) return;

    if (sessionState === "disconnected") {
      setError(null);
      void live.connect();
    } else if (sessionState === "speaking") {
      live.interrupt();
    }
  }, [sessionState]);

  const handleToggleMic = useCallback(() => {
    sessionRef.current?.toggleMicMute();
  }, []);

  const handleToggleSpeaker = useCallback(() => {
    sessionRef.current?.toggleSpeakerMute();
  }, []);

  const isActive =
    sessionState === "listening" || sessionState === "speaking";

  const statusLabel =
    sessionState === "disconnected"
      ? "Idle · Tap mic to talk"
      : sessionState === "connecting"
        ? "Connecting…"
        : sessionState === "speaking"
          ? "Mahi is speaking"
          : micMuted
            ? "Microphone muted"
            : "Listening";

  return (
    <div className="relative h-[100dvh] w-full bg-[#07080B] text-zinc-100 flex flex-col justify-between overflow-hidden select-none">
      {/* Top Bar */}
      <header className="relative z-20 flex items-center justify-between px-5 sm:px-8 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-white">
            Mahi
          </h1>
          {isActive ? (
            <span className="font-mono-tabular text-xs text-zinc-400">
              {formatDuration(elapsedSeconds)}
            </span>
          ) : (
            <span className="text-xs text-zinc-500">Voice Companion</span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="Open voice actions"
          className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/5 transition-colors focus-visible:outline-2 focus-visible:outline-rose-400"
        >
          <Compass className="w-5 h-5" />
        </button>
      </header>

      {/* Transient Executed Browser Action Card */}
      <div className="absolute top-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] left-0 right-0 z-30 pointer-events-none">
        <ActionBanner
          action={activeAction}
          onDismiss={() => setActiveAction(null)}
        />
      </div>

      {/* Central Fullscreen Acoustic Core */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center min-h-0">
        <AcousticCoreCanvas
          sessionRef={sessionRef}
          state={sessionState}
          mood={mood}
          micMuted={micMuted}
          onOrbTap={handleOrbTap}
        />

        {/* State Status Readout */}
        <div className="pb-4 sm:pb-6 flex flex-col items-center gap-2 px-4">
          <div className="flex items-center gap-2 text-sm font-medium tracking-wide text-zinc-200">
            {sessionState === "connecting" && (
              <Loader2 className="w-4 h-4 text-rose-400 animate-spin" />
            )}
            {sessionState === "speaking" && (
              <Radio className="w-4 h-4 text-rose-400" />
            )}
            {sessionState === "listening" && !micMuted && (
              <Mic className="w-4 h-4 text-sky-300" />
            )}
            {sessionState === "listening" && micMuted && (
              <MicOff className="w-4 h-4 text-zinc-400" />
            )}
            <span>{statusLabel}</span>
          </div>

          {sessionState === "speaking" && (
            <p className="text-xs text-zinc-500">
              Speak or tap orb to interrupt
            </p>
          )}
        </div>
      </main>

      {/* Error Toast */}
      {error && (
        <div
          role="alert"
          className="relative z-30 w-full max-w-sm mx-auto px-4 mb-3"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-rose-950/70 border border-rose-500/30 text-rose-100 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="leading-snug">{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-white/10 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Bottom Ergonomic Thumb-Zone Dock */}
      <footer className="relative z-20 flex items-center justify-center gap-6 sm:gap-8 px-6 pt-2 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={handleToggleMic}
          disabled={!isActive}
          aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
          aria-pressed={micMuted}
          className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all duration-150 focus-visible:outline-2 focus-visible:outline-rose-400 ${
            !isActive
              ? "opacity-0 pointer-events-none scale-90 border-transparent"
              : micMuted
                ? "bg-zinc-800/90 border-zinc-600 text-zinc-300 active:scale-95"
                : "bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10 active:scale-95"
          }`}
        >
          {micMuted ? (
            <MicOff className="w-5 h-5" />
          ) : (
            <Mic className="w-5 h-5" />
          )}
        </button>

        {/* Central Power / Mic Button */}
        <button
          type="button"
          onClick={handlePrimaryToggle}
          aria-label={
            sessionState === "disconnected"
              ? "Start voice session"
              : sessionState === "connecting"
                ? "Cancel connection"
                : "End voice session"
          }
          className={`relative w-[72px] h-[72px] rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rose-400 cursor-pointer ${
            sessionState === "disconnected"
              ? "bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-[0_0_40px_-6px_rgba(244,63,94,0.65)] hover:from-rose-400 hover:to-rose-500"
              : sessionState === "connecting"
                ? "bg-zinc-900 border border-rose-400/50 text-rose-300"
                : "bg-rose-500/15 border border-rose-400/40 text-rose-200 hover:bg-rose-500/25 shadow-[0_0_32px_-8px_rgba(244,63,94,0.45)]"
          }`}
        >
          {sessionState === "disconnected" && <Mic className="w-7 h-7" />}
          {sessionState === "connecting" && (
            <Loader2 className="w-7 h-7 animate-spin" />
          )}
          {isActive && <PhoneOff className="w-6 h-6" />}
        </button>

        <button
          type="button"
          onClick={handleToggleSpeaker}
          disabled={!isActive}
          aria-label={speakerMuted ? "Unmute Mahi's voice" : "Mute Mahi's voice"}
          aria-pressed={speakerMuted}
          className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all duration-150 focus-visible:outline-2 focus-visible:outline-rose-400 ${
            !isActive
              ? "opacity-0 pointer-events-none scale-90 border-transparent"
              : speakerMuted
                ? "bg-zinc-800/90 border-zinc-600 text-zinc-300 active:scale-95"
                : "bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10 active:scale-95"
          }`}
        >
          {speakerMuted ? (
            <VolumeX className="w-5 h-5" />
          ) : (
            <Volume2 className="w-5 h-5" />
          )}
        </button>
      </footer>

      <VoiceCapabilitiesSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        recentActions={recentActions}
      />
    </div>
  );
}
