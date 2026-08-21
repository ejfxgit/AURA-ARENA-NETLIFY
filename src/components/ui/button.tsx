import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-aura-accent/60 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
  {
    variants: {
      variant: {
        primary:
          "bg-aura-accent text-white shadow-glow hover:bg-[#8b70ff] active:scale-[0.985]",
        secondary:
          "bg-white/[0.06] text-white border border-white/10 hover:bg-white/[0.1]",
        ghost: "text-white/70 hover:text-white hover:bg-white/5",
        success:
          "bg-aura-long text-black shadow-glow-green hover:brightness-110 active:scale-[0.985]",
        danger:
          "bg-aura-short text-white shadow-glow-red hover:brightness-110 active:scale-[0.985]",
        outline:
          "border border-white/15 text-white hover:bg-white/5",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        xl: "h-14 px-8 text-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
