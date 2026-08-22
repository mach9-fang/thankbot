import React from "react";
import { ImageResponse } from "next/og";
import { decode } from "fast-png";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { formatNameList } from "./format";

export const THANKS_CARD_GIF_WIDTH = 600;
export const THANKS_CARD_GIF_HEIGHT = 340;
export const THANKS_CARD_GIF_FRAME_COUNT = 10;
export const THANKS_CARD_GIF_FRAME_DELAY_MS = 100;
export const THANKS_CARD_GIF_DURATION_MS =
  THANKS_CARD_GIF_FRAME_COUNT * THANKS_CARD_GIF_FRAME_DELAY_MS;

const CONFETTI_COLORS = [
  [0x64, 0x36, 0xf2],
  [0x7f, 0x4e, 0xf8],
  [0xbb, 0xa7, 0xff],
  [0xf5, 0x38, 0x5f],
  [0xfb, 0x5e, 0x6b],
  [0x29, 0xde, 0xd6],
  [0x12, 0xc1, 0xbd],
  [0xff, 0xff, 0xff],
] as const;

type Rgb = readonly [number, number, number];
type Shape = "rect" | "circle" | "star" | "heart";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: Rgb;
  shape: Shape;
  spin: number;
};

export type ThanksCardGifInput = {
  fromName: string;
  toNames: string[];
  reason: string;
};

const gifCache = new Map<string, Uint8Array>();

export async function renderThanksCardGifForId(
  id: string,
  card: ThanksCardGifInput
): Promise<Uint8Array> {
  const cached = gifCache.get(id);
  if (cached) return cached;
  const bytes = await renderThanksCardGif(card);
  gifCache.set(id, bytes);
  return bytes;
}

/** One-second thank-you card with confetti. Slack loops the burst. */
export async function renderThanksCardGif(
  card: ThanksCardGifInput
): Promise<Uint8Array> {
  const png = decode(await renderCardPng(card));
  const width = png.width;
  const height = png.height;
  const base = toRgba(png.data, width, height, png.channels ?? 4);
  const particles = makeParticles(width, height, seedFrom(card));

  const last = base.slice();
  drawConfetti(last, width, height, particles, 1);
  const palette = quantize(last, 256);

  const gif = GIFEncoder();
  for (let i = 0; i < THANKS_CARD_GIF_FRAME_COUNT; i++) {
    const t = i / Math.max(1, THANKS_CARD_GIF_FRAME_COUNT - 1);
    const frame = i === THANKS_CARD_GIF_FRAME_COUNT - 1 ? last : base.slice();
    if (i !== THANKS_CARD_GIF_FRAME_COUNT - 1) {
      drawConfetti(frame, width, height, particles, t);
    }
    gif.writeFrame(applyPalette(frame, palette), width, height, {
      palette,
      delay: THANKS_CARD_GIF_FRAME_DELAY_MS,
      // 1-second cycle; Slack (and browsers) loop the burst.
      repeat: 0,
    });
  }
  gif.finish();
  return gif.bytes();
}

async function renderCardPng(card: ThanksCardGifInput): Promise<Uint8Array> {
  const response = new ImageResponse(<CardFrame {...card} />, {
    width: THANKS_CARD_GIF_WIDTH,
    height: THANKS_CARD_GIF_HEIGHT,
  });
  return new Uint8Array(await response.arrayBuffer());
}

function CardFrame({ fromName, toNames, reason }: ThanksCardGifInput) {
  const toLabel = summarizeNames(toNames);
  const quoteSize = reason.length > 90 ? 22 : reason.length > 50 ? 26 : 30;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#f3f1fc",
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          borderRadius: 28,
          overflow: "hidden",
          background: "#ffffff",
          boxShadow: "0 14px 36px rgba(100, 54, 242, 0.2)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background:
              "linear-gradient(135deg, #5526d9 0%, #6436f2 50%, #7f4ef8 100%)",
            padding: "20px 26px 18px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 2.6,
              textTransform: "uppercase",
              color: "#d7cbff",
            }}
          >
            A thank you
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: 14,
              gap: 14,
            }}
          >
            <PersonChip
              label="From"
              name={truncate(fromName, 22)}
              color="#6436f2"
            />
            <div
              style={{
                display: "flex",
                color: "#fb5e6b",
                fontSize: 22,
                lineHeight: 1,
              }}
            >
              ♥
            </div>
            <PersonChip label="To" name={toLabel} color="#12c1bd" />
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            background:
              "linear-gradient(135deg, #ffffff 0%, #f3f0ff 65%, #eafffc 100%)",
            padding: "22px 26px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: quoteSize,
              fontWeight: 600,
              color: "#1e1b3c",
              lineHeight: 1.25,
              letterSpacing: -0.3,
            }}
          >
            “{truncate(reason, 160)}”
          </div>
        </div>
      </div>
    </div>
  );
}

function PersonChip({
  label,
  name,
  color,
}: {
  label: string;
  name: string;
  color: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          display: "flex",
          width: 40,
          height: 40,
          borderRadius: 20,
          background: color,
          color: "#ffffff",
          fontSize: 14,
          fontWeight: 700,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {initials(name)}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            fontSize: 10,
            color: "#d7cbff",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          {label}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 18,
            fontWeight: 600,
            color: "#ffffff",
          }}
        >
          {name}
        </div>
      </div>
    </div>
  );
}

function summarizeNames(names: string[]): string {
  if (names.length <= 3) {
    return formatNameList(names.map((name) => truncate(name, 18)));
  }
  const shown = names.slice(0, 3).map((name) => truncate(name, 12));
  const rest = names.length - 3;
  return formatNameList([
    ...shown,
    `${rest} ${rest === 1 ? "other" : "others"}`,
  ]);
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

function seedFrom(card: ThanksCardGifInput): number {
  const text = `${card.fromName}\0${card.toNames.join("\0")}\0${card.reason}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function makeParticles(width: number, height: number, seed: number): Particle[] {
  const rand = mulberry32(seed);
  const shapes: Shape[] = ["rect", "circle", "star", "heart"];
  const particles: Particle[] = [];
  // Burst from the heart between From/To so names stay readable at t=0.
  const originX = width * 0.5;
  const originY = height * 0.36;

  for (let i = 0; i < 64; i++) {
    const angle = rand() * Math.PI * 2;
    const speed = 80 + rand() * 220;
    particles.push({
      x: originX + (rand() - 0.5) * 18,
      y: originY + (rand() - 0.5) * 12,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.55 - (40 + rand() * 80),
      size: 4 + rand() * 7,
      color: CONFETTI_COLORS[Math.floor(rand() * CONFETTI_COLORS.length)],
      shape: shapes[Math.floor(rand() * shapes.length)],
      spin: (rand() - 0.5) * 12,
    });
  }

  return particles;
}

function drawConfetti(
  pixels: Uint8Array,
  width: number,
  height: number,
  particles: Particle[],
  t: number
) {
  const gravity = 430;
  for (const particle of particles) {
    const x = particle.x + particle.vx * t;
    const y = particle.y + particle.vy * t + 0.5 * gravity * t * t;
    const rot = particle.spin * t;
    if (x < -12 || y < -12 || x > width + 12 || y > height + 12) continue;
    // Keep From/To names readable — allow the burst through the heart only.
    if (y > 52 && y < 128 && Math.abs(x - width / 2) > 46) continue;

    switch (particle.shape) {
      case "circle":
        fillCircle(pixels, width, height, x, y, particle.size * 0.55, particle.color);
        break;
      case "heart":
        fillHeart(pixels, width, height, x, y, particle.size * 0.7, particle.color);
        break;
      case "star":
        fillStar(pixels, width, height, x, y, particle.size * 0.7, rot, particle.color);
        break;
      default:
        fillRect(
          pixels,
          width,
          height,
          x,
          y,
          particle.size,
          particle.size * 0.45,
          rot,
          particle.color
        );
    }
  }
}

function setPixel(
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  color: Rgb
) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const i = (y * width + x) * 4;
  pixels[i] = color[0];
  pixels[i + 1] = color[1];
  pixels[i + 2] = color[2];
  pixels[i + 3] = 255;
}

function fillCircle(
  pixels: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  color: Rgb
) {
  const r2 = radius * radius;
  const x0 = Math.floor(cx - radius);
  const x1 = Math.ceil(cx + radius);
  const y0 = Math.floor(cy - radius);
  const y1 = Math.ceil(cy + radius);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) setPixel(pixels, width, height, x, y, color);
    }
  }
}

function fillRect(
  pixels: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  w: number,
  h: number,
  rot: number,
  color: Rgb
) {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const hw = w / 2;
  const hh = h / 2;
  const reach = Math.ceil(Math.hypot(hw, hh));
  const x0 = Math.floor(cx - reach);
  const x1 = Math.ceil(cx + reach);
  const y0 = Math.floor(cy - reach);
  const y1 = Math.ceil(cy + reach);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;
      if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) {
        setPixel(pixels, width, height, x, y, color);
      }
    }
  }
}

function fillHeart(
  pixels: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  size: number,
  color: Rgb
) {
  const scale = Math.max(1.6, size);
  const x0 = Math.floor(cx - scale * 1.2);
  const x1 = Math.ceil(cx + scale * 1.2);
  const y0 = Math.floor(cy - scale);
  const y1 = Math.ceil(cy + scale * 1.2);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const nx = (x + 0.5 - cx) / scale;
      const ny = -((y + 0.5 - cy) / scale);
      const a = nx * nx + ny * ny - 1;
      if (a * a * a - nx * nx * ny * ny * ny <= 0) {
        setPixel(pixels, width, height, x, y, color);
      }
    }
  }
}

function fillStar(
  pixels: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  size: number,
  rot: number,
  color: Rgb
) {
  const outer = size;
  const inner = size * 0.42;
  const x0 = Math.floor(cx - outer);
  const x1 = Math.ceil(cx + outer);
  const y0 = Math.floor(cy - outer);
  const y1 = Math.ceil(cy + outer);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const angle = Math.atan2(dy, dx) - rot;
      const r = Math.hypot(dx, dy);
      const spikes = 5;
      const step = Math.PI / spikes;
      const mod = ((angle + Math.PI) % (2 * step)) - step;
      const limit = inner + (outer - inner) * (1 - Math.abs(mod) / step);
      if (r <= limit) setPixel(pixels, width, height, x, y, color);
    }
  }
}

function toRgba(
  data: ArrayLike<number>,
  width: number,
  height: number,
  channels: number
): Uint8Array {
  if (channels === 4 && data instanceof Uint8Array) {
    return data.slice();
  }

  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const src = i * channels;
    const dest = i * 4;
    out[dest] = data[src] ?? 0;
    out[dest + 1] = data[src + 1] ?? out[dest];
    out[dest + 2] = data[src + 2] ?? out[dest];
    out[dest + 3] = channels === 4 ? (data[src + 3] ?? 255) : 255;
  }
  return out;
}
