import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** shadcn-style card — colours resolve to Astrolabe tokens only. */
export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-md border bg-[var(--card)] text-[var(--card-foreground)] shadow-none",
        className,
      )}
      style={{ borderColor: "var(--border)" }}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col gap-1.5 p-5 pb-3", className)} {...props} />
  );
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "text-[13px] font-medium uppercase tracking-[0.08em]",
        className,
      )}
      style={{ color: "var(--brass)" }}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-[14px] leading-snug", className)}
      style={{ color: "var(--muted-foreground)" }}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-2", className)} {...props} />;
}
