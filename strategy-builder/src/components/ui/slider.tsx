"use client";

/**
 * Radix slider with embed-safe CSS classes (no Tailwind in the Vite bundle).
 * Styles live in embed.css under .bos-slider-*.
 */

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("bos-slider", className)}
    {...props}
  >
    <SliderPrimitive.Track className="bos-slider-track">
      <SliderPrimitive.Range className="bos-slider-range" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="bos-slider-thumb" />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
