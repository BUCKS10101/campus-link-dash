import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The one page-width contract every screen uses. Centralizing this is
 * what stops each page from hand-rolling a slightly different
 * `container mx-auto px-4` and drifting out of alignment with the others.
 */
export function PageContainer({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mx-auto w-full max-w-layout px-4 md:px-6", className)}
      {...props}
    />
  );
}
