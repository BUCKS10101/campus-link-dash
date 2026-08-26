import * as React from "react";

import { cn } from "@/lib/utils";
import { Text } from "@/components/primitives";

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  /** Right-aligned contextual action — e.g. a page-level button. */
  action?: React.ReactNode;
}

/**
 * The shared title block for a page. Not every page needs one in 2B (this
 * milestone doesn't redesign page contents), but it exists now so 2C+
 * pages adopt one consistent title/description/action pattern instead of
 * each inventing its own heading markup.
 */
export function PageHeader({ title, description, action, className, ...props }: PageHeaderProps) {
  return (
    <div
      className={cn("flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between", className)}
      {...props}
    >
      <div className="flex flex-col gap-1">
        <Text as="h1" variant="h1">
          {title}
        </Text>
        {description ? (
          <Text variant="bodySm" tone="muted">
            {description}
          </Text>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}
