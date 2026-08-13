"use client";

import { useEffect } from "react";

const COLORS = [
  "#6436f2",
  "#7f4ef8",
  "#bba7ff",
  "#f5385f",
  "#fb5e6b",
  "#29ded6",
  "#12c1bd",
  "#ffffff",
];

export function ConfettiOnOpen() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let cancelled = false;
    let reset: (() => void) | undefined;
    let followUp: number | undefined;

    async function celebrate() {
      const confetti = (await import("canvas-confetti")).default;
      if (cancelled) return;

      reset = confetti.reset;

      const defaults = {
        colors: COLORS,
        disableForReducedMotion: true,
      };

      void confetti({
        ...defaults,
        particleCount: 80,
        spread: 70,
        startVelocity: 48,
        origin: { x: 0.5, y: 0.55 },
      });

      void confetti({
        ...defaults,
        particleCount: 45,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
      });

      void confetti({
        ...defaults,
        particleCount: 45,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
      });

      followUp = window.setTimeout(() => {
        if (cancelled) return;
        void confetti({
          ...defaults,
          particleCount: 50,
          spread: 110,
          decay: 0.91,
          scalar: 0.9,
          origin: { x: 0.5, y: 0.42 },
        });
      }, 180);
    }

    void celebrate();

    return () => {
      cancelled = true;
      if (followUp !== undefined) window.clearTimeout(followUp);
      reset?.();
    };
  }, []);

  return null;
}
