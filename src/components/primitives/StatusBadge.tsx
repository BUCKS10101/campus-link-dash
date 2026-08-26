import * as React from "react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { OrderStatus } from "@/lib/orderStatus";
import { STATUS_PRESENTATION } from "./statusPresentation";

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  status: OrderStatus;
  /** Shorter label for dense rows; the icon still carries the meaning. */
  compact?: boolean;
}

export function StatusBadge({ status, compact = false, className, ...props }: StatusBadgeProps) {
  const presentation = STATUS_PRESENTATION[status];

  // Defensive: a status the database permits but this map has not caught
  // up with should degrade to something readable rather than crash a feed.
  if (!presentation) {
    return (
      <Badge variant="secondary" className={className} {...props}>
        {status}
      </Badge>
    );
  }

  const { label, short, tone, icon: Icon } = presentation;

  return (
    <Badge variant={tone} className={cn("gap-1.5", className)} {...props}>
      <Icon className="size-3.5" aria-hidden="true" />
      <span>{compact ? short : label}</span>
    </Badge>
  );
}
