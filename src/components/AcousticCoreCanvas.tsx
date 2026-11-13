import { useEffect, useRef } from "react";
import type { AuraMood, SessionState } from "../types/voice";
import type { LiveSession } from "../services/liveSession";

interface AcousticCoreCanvasProps {
  sessionRef: React.RefObject<LiveSession | null>;
  state: SessionState;
  mood: AuraMood;
  micMuted: boolean;
  onOrbTap: () => void;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const MOOD_PALETTES: Record<AuraMood, { primary: Rgb; secondary: Rgb }> = {
  rose: {
    primary: { r: 244, g: 63, b: 94 },
    secondary: { r: 251, g: 146, b: 60 },
  },
  amber: {
    primary: { r: 245, g: 158, b: 11 },
    secondary: { r: 244, g: 63, b: 94 },
  },
  violet: {
    primary: { r: 139, g: 92, b: 246 },
    secondary: { r: 236, g: 72, b: 153 },
  },
  ice: {
    primary: { r: 56, g: 189, b: 248 },
    secondary: { r: 165, g: 180, b: 252 },
  },
};

const LISTENING_PALETTE = {
  primary: { r: 147, g: 197, b: 253 },
  secondary: { r: 226, g: 232, b: 240 },
};

const IDLE_PALETTE = {
  primary: { r: 161, g: 161, b: 170 },
  secondary: { r: 244, g: 63, b: 94 },
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function AcousticCoreCanvas({
  sessionRef,
  state,
  mood,
  micMuted,
  onOrbTap,
}: AcousticCoreCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  const moodRef = useRef(mood);
  const micMutedRef = useRef(micMuted);

  stateRef.current = state;
  moodRef.current = mood;
  micMutedRef.current = micMuted;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let animationFrameId = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const freqBins = new Uint8Array(new ArrayBuffer(128));
    let smoothLevel = 0;
    let phase = 0;
    let currentPrimary = { ...IDLE_PALETTE.primary };
    let currentSecondary = { ...IDLE_PALETTE.secondary };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const render = () => {
      animationFrameId = requestAnimationFrame(render);
      if (width === 0 || height === 0) return;

      const activeState = stateRef.current;
      const activeMood = moodRef.current;
      const isMicMuted = micMutedRef.current;
      const session = sessionRef.current;

      let targetLevel = 0;
      if (activeState === "speaking" && session) {
        targetLevel = session.getAudioLevel("output", freqBins);
      } else if (activeState === "listening" && session && !isMicMuted) {
        targetLevel = session.getAudioLevel("input", freqBins);
      } else {
        freqBins.fill(0);
      }

      smoothLevel = lerp(smoothLevel, targetLevel, 0.22);

      const targetPalette =
        activeState === "speaking"
          ? MOOD_PALETTES[activeMood]
          : activeState === "listening"
            ? LISTENING_PALETTE
            : activeState === "connecting"
              ? MOOD_PALETTES[activeMood]
              : IDLE_PALETTE;

      currentPrimary = {
        r: lerp(currentPrimary.r, targetPalette.primary.r, 0.08),
        g: lerp(currentPrimary.g, targetPalette.primary.g, 0.08),
        b: lerp(currentPrimary.b, targetPalette.primary.b, 0.08),
      };
      currentSecondary = {
        r: lerp(currentSecondary.r, targetPalette.secondary.r, 0.08),
        g: lerp(currentSecondary.g, targetPalette.secondary.g, 0.08),
        b: lerp(currentSecondary.b, targetPalette.secondary.b, 0.08),
      };

      const pr = Math.round(currentPrimary.r);
      const pg = Math.round(currentPrimary.g);
      const pb = Math.round(currentPrimary.b);
      const sr = Math.round(currentSecondary.r);
      const sg = Math.round(currentSecondary.g);
      const sb = Math.round(currentSecondary.b);

      const speedMultiplier = prefersReducedMotion
        ? 0.2
        : activeState === "speaking"
          ? 1.55
          : activeState === "connecting"
            ? 2.1
            : activeState === "listening"
              ? 1.0
              : 0.45;
      phase += 0.016 * speedMultiplier;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const minDim = Math.min(width, height);
      const baseRadius = Math.max(68, Math.min(minDim * 0.23, 132));
      const dynamicRadius =
        baseRadius +
        (activeState === "speaking"
          ? smoothLevel * 28
          : activeState === "listening"
            ? smoothLevel * 18
            : Math.sin(phase) * 3);

      // Outer atmospheric glow
      const glowRadius = dynamicRadius * (activeState === "disconnected" ? 1.85 : 2.35 + smoothLevel * 0.65);
      const glowGrad = ctx.createRadialGradient(
        cx,
        cy,
        dynamicRadius * 0.25,
        cx,
        cy,
        glowRadius
      );
      const glowAlpha =
        activeState === "disconnected"
          ? 0.1
          : activeState === "speaking"
            ? 0.26 + smoothLevel * 0.22
            : activeState === "listening"
              ? 0.16 + smoothLevel * 0.18
              : 0.18;

      glowGrad.addColorStop(0, `rgba(${pr}, ${pg}, ${pb}, ${glowAlpha})`);
      glowGrad.addColorStop(0.55, `rgba(${sr}, ${sg}, ${sb}, ${glowAlpha * 0.35})`);
      glowGrad.addColorStop(1, "rgba(7, 8, 11, 0)");

      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      // Subtle concentric pulse rings when active
      if (activeState === "listening" || activeState === "speaking") {
        const ringCount = 2;
        for (let i = 0; i < ringCount; i++) {
          const progress = ((phase * 0.35 + i / ringCount) % 1);
          const r = dynamicRadius * (1.06 + progress * (0.48 + smoothLevel * 0.35));
          const alpha = (1 - progress) * (activeState === "speaking" ? 0.28 : 0.16) * (0.5 + smoothLevel);
          ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Connecting orbital arc
      if (activeState === "connecting") {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(phase * 1.4);
        ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, 0.72)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, dynamicRadius * 1.15, 0, Math.PI * 0.85);
        ctx.stroke();

        ctx.rotate(Math.PI);
        ctx.strokeStyle = `rgba(${sr}, ${sg}, ${sb}, 0.45)`;
        ctx.beginPath();
        ctx.arc(0, 0, dynamicRadius * 1.15, 0, Math.PI * 0.6);
        ctx.stroke();
        ctx.restore();
      }

      // Organic harmonic acoustic ring
      const pointCount = 96;
      const points: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < pointCount; i++) {
        const angle = (i / pointCount) * Math.PI * 2;
        const binIndex = Math.floor((i / pointCount) * 44);
        const fftVal = freqBins[binIndex] / 255;

        const harmonic1 = Math.sin(angle * 3 + phase * 1.8) * (activeState === "speaking" ? 5.5 : 2.5);
        const harmonic2 = Math.cos(angle * 5 - phase * 1.3) * (activeState === "speaking" ? 4.0 : 1.8);
        const audioDisplacement =
          activeState === "speaking"
            ? fftVal * 26 + smoothLevel * 8
            : activeState === "listening"
              ? fftVal * 16 + smoothLevel * 5
              : 0;

        const radius =
          dynamicRadius +
          (activeState === "disconnected"
            ? Math.sin(angle * 2 + phase) * 1.5
            : harmonic1 + harmonic2 + audioDisplacement);

        points.push({
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
        });
      }

      // Obsidian interior core fill
      const coreGrad = ctx.createRadialGradient(
        cx - dynamicRadius * 0.22,
        cy - dynamicRadius * 0.25,
        dynamicRadius * 0.1,
        cx,
        cy,
        dynamicRadius * 1.15
      );
      coreGrad.addColorStop(0, "rgba(30, 32, 42, 0.95)");
      coreGrad.addColorStop(0.65, "rgba(13, 14, 20, 0.96)");
      coreGrad.addColorStop(1, `rgba(${pr}, ${pg}, ${pb}, ${activeState === "disconnected" ? 0.14 : 0.28})`);

      ctx.beginPath();
      for (let i = 0; i < pointCount; i++) {
        const curr = points[i];
        const next = points[(i + 1) % pointCount];
        const midX = (curr.x + next.x) / 2;
        const midY = (curr.y + next.y) / 2;
        if (i === 0) {
          const prev = points[pointCount - 1];
          ctx.moveTo((prev.x + curr.x) / 2, (prev.y + curr.y) / 2);
        }
        ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
      }
      ctx.closePath();
      ctx.fillStyle = coreGrad;
      ctx.fill();

      // Luminous rim stroke
      const rimGrad = ctx.createLinearGradient(
        cx - dynamicRadius,
        cy - dynamicRadius,
        cx + dynamicRadius,
        cy + dynamicRadius
      );
      const rimAlpha =
        activeState === "disconnected"
          ? 0.35
          : activeState === "speaking"
            ? 0.85
            : 0.65;
      rimGrad.addColorStop(0, `rgba(${pr}, ${pg}, ${pb}, ${rimAlpha})`);
      rimGrad.addColorStop(1, `rgba(${sr}, ${sg}, ${sb}, ${rimAlpha * 0.75})`);
      ctx.strokeStyle = rimGrad;
      ctx.lineWidth = activeState === "speaking" ? 2.2 : 1.5;
      ctx.stroke();

      // Internal equatorial live waveform ribbon
      const ribbonWidth = dynamicRadius * 1.18;
      const ribbonPoints = 40;
      ctx.beginPath();
      for (let i = 0; i <= ribbonPoints; i++) {
        const t = i / ribbonPoints;
        const x = cx - ribbonWidth / 2 + t * ribbonWidth;
        const envelope = Math.sin(t * Math.PI);
        const binIdx = Math.floor(t * 36);
        const fftAmp = freqBins[binIdx] / 255;

        const idleWave =
          Math.sin(t * 6 + phase * 2.2) *
          (activeState === "disconnected" ? 2 : 4);
        const voiceWave =
          Math.sin(t * 10 - phase * 4.5) *
          (activeState === "speaking"
            ? 6 + fftAmp * 26
            : activeState === "listening" && !isMicMuted
              ? 3 + fftAmp * 16
              : 0);

        const y = cy + (idleWave + voiceWave) * envelope;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.strokeStyle =
        activeState === "disconnected"
          ? "rgba(255, 255, 255, 0.2)"
          : `rgba(${pr}, ${pg}, ${pb}, ${0.55 + smoothLevel * 0.45})`;
      ctx.lineWidth = activeState === "speaking" ? 2 : 1.5;
      ctx.stroke();

      ctx.restore();
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      observer.disconnect();
    };
  }, [sessionRef]);

  return (
    <div className="relative flex-1 w-full flex items-center justify-center">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={onOrbTap}
        aria-label={
          state === "disconnected"
            ? "Tap to start voice conversation with Mahi"
            : state === "speaking"
              ? "Tap to interrupt Mahi"
              : state === "listening"
                ? "Mahi is listening"
                : "Connecting voice session"
        }
        className="absolute w-44 h-44 sm:w-56 sm:h-56 rounded-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rose-400 bg-transparent"
      />
    </div>
  );
}
