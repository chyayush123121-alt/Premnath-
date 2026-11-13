import { ExternalLink, Globe, Search, X } from "lucide-react";
import type { ExecutedAction } from "../types/voice";

interface ActionBannerProps {
  action: ExecutedAction | null;
  onDismiss: () => void;
}

export function ActionBanner({ action, onDismiss }: ActionBannerProps) {
  if (!action) return null;

  const isSearch = action.toolName === "searchWeb";

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full max-w-sm mx-auto px-4 pointer-events-auto"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-zinc-900/90 backdrop-blur-md border border-white/10 shadow-lg shadow-black/40">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-400/20 flex items-center justify-center shrink-0 text-rose-300">
            {isSearch ? (
              <Search className="w-4 h-4" />
            ) : (
              <Globe className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-100 truncate">
              {action.title}
            </p>
            <p className="text-xs text-zinc-400 truncate">{action.subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {action.url && (
            <a
              href={action.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] px-3 rounded-xl bg-white/10 hover:bg-white/15 active:scale-[0.97] text-xs font-medium text-white flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-rose-400"
            >
              <span>Open</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss action notification"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors focus-visible:outline-2 focus-visible:outline-rose-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
