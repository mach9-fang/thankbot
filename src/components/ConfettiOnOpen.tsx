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

/** Same path as the heart icon on the thank-you card. */
const HEART_PATH =
  "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

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

      const heart = confetti.shapeFromPath({ path: HEART_PATH });
      // Classic pieces still dominate; stars and hearts show up as a regular mix.
      const shapes = [
        "square",
        "circle",
        "square",
        "circle",
        "star",
        heart,
      ] as const;

      const defaults = {
        colors: COLORS,
        disableForReducedMotion: true,
        shapes: [...shapes],
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
