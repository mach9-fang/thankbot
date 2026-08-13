"use client";

import { useEffect } from "react";
import type { Options } from "canvas-confetti";

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

/**
 * Heart from the canvas-confetti custom-shape demo (Noun Project heart-1545381).
 * Path shapes render smaller than squares/stars, so the cached matrix plus a
 * higher scalar keeps them readable in the mix.
 */
const HEART_PATH =
  "M167 72c19,-38 37,-56 75,-56 42,0 76,33 76,75 0,76 -76,151 -151,227 -76,-76 -151,-151 -151,-227 0,-42 33,-75 75,-75 38,0 57,18 76,56z";

const HEART_MATRIX = [
  0.03333333333333333, 0, 0, 0.03333333333333333, -5.566666666666666,
  -5.533333333333333,
] as unknown as DOMMatrix;

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

      const heart = confetti.shapeFromPath({
        path: HEART_PATH,
        matrix: HEART_MATRIX,
      });

      const defaults: Options = {
        colors: COLORS,
        disableForReducedMotion: true,
        ticks: 100,
        gravity: 1.2,
      };

      function fire(opts: Options) {
        const scalar = opts.scalar ?? 1;
        const count = opts.particleCount ?? 50;

        void confetti({
          ...defaults,
          shapes: ["square", "circle"],
          ...opts,
          scalar,
          particleCount: Math.round(count * 0.5),
        });
        void confetti({
          ...defaults,
          ...opts,
          shapes: ["star"],
          scalar: scalar * 0.6,
          particleCount: Math.round(count * 0.25),
        });
        // Path hearts render smaller than squares; 1.7 matches the previous size, then +20%.
        void confetti({
          ...defaults,
          ...opts,
          shapes: [heart],
          scalar: scalar * 1.7 * 1.2,
          particleCount: Math.round(count * 0.25),
        });
      }

      fire({
        particleCount: 80,
        spread: 70,
        startVelocity: 48,
        origin: { x: 0.5, y: 0.55 },
      });

      fire({
        particleCount: 45,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
      });

      fire({
        particleCount: 45,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
      });

      followUp = window.setTimeout(() => {
        if (cancelled) return;
        fire({
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
