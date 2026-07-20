"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

/** Embed-safe tooltip content (styled via .bos-tooltip in embed.css). */
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 8, children, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn("bos-tooltip", className)}
      {...props}
    >
      {children}
      <TooltipPrimitive.Arrow className="bos-tooltip-arrow" width={10} height={5} />
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/** Label + optional help icon with tooltip text */
function HelpTip({
  label,
  tip,
  className,
}: {
  label: React.ReactNode;
  tip: string;
  className?: string;
}) {
  return (
    <span className={cn("bos-helptip", className)}>
      <span className="bos-helptip-label">{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="bos-helptip-btn"
            aria-label="More info"
            onClick={(e) => e.preventDefault()}
          >
            ?
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{tip}</TooltipContent>
      </Tooltip>
    </span>
  );
}

/** Icon-only help trigger for toolbars */
function Tip({ tip, children }: { tip: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top">{tip}</TooltipContent>
    </Tooltip>
  );
}

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  HelpTip,
  Tip,
};
