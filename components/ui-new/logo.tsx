import { CalendarCheck2 } from "lucide-react";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center justify-center rounded-xl bg-primary text-primary-foreground"
        style={{ width: size + 8, height: size + 8 }}
      >
        <CalendarCheck2 size={size - 6} />
      </div>
      <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: -0.3 }}>
        Slottly
      </span>
    </div>
  );
}