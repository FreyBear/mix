import { ImageResponse } from "next/og";

export const dynamic = "force-dynamic";

const DOTS = ["#e11d48", "#f59e0b", "#2563eb", "#16a34a"];

export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const requested = Number((await params).size);
  const size = [180, 192, 512].includes(requested) ? requested : 512;
  const maskable = new URL(req.url).searchParams.get("maskable") === "1";
  const inner = maskable ? 0.6 : 0.8;
  const dot = size * 0.15 * (inner / 0.8);
  const gap = size * 0.05;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#4f46e5",
          borderRadius: maskable ? 0 : size * 0.22,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap,
            width: size * inner,
          }}
        >
          {[3, 4, 3].map((n, row) => (
            <div key={row} style={{ display: "flex", gap }}>
              {Array.from({ length: n }, (_, i) => (
                <div
                  key={i}
                  style={{
                    width: dot * 1.3,
                    height: dot,
                    borderRadius: "50%",
                    background: DOTS[(i + row) % DOTS.length],
                    border: `${Math.max(2, size * 0.008)}px solid #fff`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
