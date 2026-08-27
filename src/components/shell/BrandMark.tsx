export interface BrandMarkProps {
  size?: number;
  className?: string;
}

/**
 * The relay-dot mark (public/brand/) - two unequal dots on a short dashed
 * line: filled = has the item, hollow = waiting for it, dash = the
 * distance between them. Static SVG assets, not recreated inline, so both
 * nav surfaces (and anything else) stay pixel-identical to the approved
 * brand file. Light/dark variants are two separate assets swapped via
 * Tailwind's `dark:` class rather than one asset trying to reinterpret
 * itself - each is tuned for its own background's contrast.
 */
export function BrandMark({ size = 26, className }: BrandMarkProps) {
  return (
    <>
      <img
        src="/brand/campuslink-mark-light.svg"
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        className={`dark:hidden ${className ?? ""}`}
      />
      <img
        src="/brand/campuslink-mark-dark.svg"
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        className={`hidden dark:block ${className ?? ""}`}
      />
    </>
  );
}
