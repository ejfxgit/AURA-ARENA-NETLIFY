import { cn, directionColor } from "@/lib/utils";
import type { Direction } from "@/lib/types";

const bg: Record<Direction, string> = {
  LONG: "bg-aura-long/15 border-aura-long/30",
  SHORT: "bg-aura-short/15 border-aura-short/30",
  WAIT: "bg-aura-wait/15 border-aura-wait/30",
};

export function DirectionBadge({
  direction,
  className,
  size = "md",
}: {
  direction: Direction;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sz =
    size === "lg"
      ? "px-3 py-1 text-sm"
      : size === "sm"
        ? "px-2 py-0.5 text-[11px]"
        : "px-2.5 py-1 text-xs";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border font-bold tracking-[0.08em]",
        bg[direction],
        directionColor(direction),
        sz,
        className,
      )}
    >
      <span
        className={cn(
          "mr-1.5 h-1.5 w-1.5 rounded-full",
          direction === "LONG"
            ? "bg-aura-long"
            : direction === "SHORT"
              ? "bg-aura-short"
              : "bg-aura-wait",
        )}
      />
      {direction}
    </span>
  );
}
