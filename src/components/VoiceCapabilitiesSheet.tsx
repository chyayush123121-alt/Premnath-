import { Clock, ExternalLink, Globe, Search, Sparkles, X } from "lucide-react";
import type { ExecutedAction } from "../types/voice";

interface VoiceCapabilitiesSheetProps {
  open: boolean;
  onClose: () => void;
  recentActions: ExecutedAction[];
}

export function VoiceCapabilitiesSheet({
  open,
  onClose,
  recentActions,
}: VoiceCapabilitiesSheetProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-actions-title"
    >
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[#0F1117] border-t sm:border border-white/10 px-6 pt-3 pb-[max(1.75rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-4 sm:hidden" />

        <div className="flex items-center justify-between mb-5">
          <h2
            id="voice-actions-title"
            className="font-display text-lg font-semibold text-white tracking-tight"
          >
            Voice Actions
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close voice actions"
            className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/5 transition-colors focus-visible:outline-2 focus-visible:outline-rose-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-zinc-800/80 flex items-center justify-center shrink-0 text-rose-300">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-100">Open Websites</p>
              <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                Ask Mahi to pull up YouTube, Spotify, GitHub, or any site hands-free.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-zinc-800/80 flex items-center justify-center shrink-0 text-rose-300">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-100">Instant Web Search</p>
              <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                Tell her to look something up and she opens live results directly.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-zinc-800/80 flex items-center justify-center shrink-0 text-rose-300">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-100">Natural Barge-In</p>
              <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                Interrupt anytime just by speaking or tapping the glowing core.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-zinc-800/80 flex items-center justify-center shrink-0 text-rose-300">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-100">Time Awareness</p>
              <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                She knows your local time and won&apos;t hesitate to roast late-night calls.
              </p>
            </div>
          </div>
        </div>

        {recentActions.length > 0 && (
          <div className="mt-6 pt-5 border-t border-white/10">
            <p className="text-xs font-medium text-zinc-400 mb-3">
              Recent Actions
            </p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {recentActions.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors min-h-[44px]"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-100 truncate">{item.title}</p>
                    <p className="text-xs text-zinc-400 truncate">{item.subtitle}</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-zinc-400 shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
