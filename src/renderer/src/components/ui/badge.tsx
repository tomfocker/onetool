import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition-all duration-300 ease-apple backdrop-blur-sm",
  {
    variants: {
      variant: {
        default:
          "bg-primary/90 text-primary-foreground shadow-soft-sm hover:bg-primary",
        secondary:
          "bg-secondary/80 text-secondary-foreground shadow-soft-sm hover:bg-secondary",
        destructive:
          "bg-destructive/90 text-destructive-foreground shadow-soft-sm hover:bg-destructive",
        outline: "border border-white/20 dark:border-white/10 bg-white/30 dark:bg-white/10 text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
