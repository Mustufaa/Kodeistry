import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export function GET() {
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", height: "100%", padding: "80px", background: "#121116", color: "#fafafa", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", color: "#b8a6ff", fontSize: 34, marginBottom: 36 }}>Kodeistry</div>
      <div style={{ display: "flex", fontSize: 68, fontWeight: 700, lineHeight: 1.12 }}>AI code review for GitHub pull requests</div>
      <div style={{ display: "flex", fontSize: 28, marginTop: 36, color: "#c2bdcc" }}>Changed code. Actionable findings. Developer judgment.</div>
    </div>,
    { width: 1200, height: 630 },
  );
}
