import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-zinc-800 text-zinc-300",
        call: "border-emerald-800/60 bg-emerald-950/60 text-emerald-400",
        put: "border-red-800/60 bg-red-950/60 text-red-400",
        buy: "border-emerald-700/50 bg-emerald-900/40 text-emerald-300",
        sell: "border-red-700/50 bg-red-900/40 text-red-300",
        outline: "border-zinc-700 text-zinc-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
