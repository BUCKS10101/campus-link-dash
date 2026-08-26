/**
 * Dusk Wayfinding — foundational primitives.
 *
 * These sit alongside the vendored shadcn components in components/ui
 * rather than inside them: ui/* is upstream code we re-skin, this folder
 * is CampusLink's own layer. Later milestones compose feature components
 * (OrderCard, OrderTimeline, OtpDisplay) from these.
 */
export { Text, type TextProps } from "./Text";
export { Surface, type SurfaceProps } from "./Surface";
export { Rule, type RuleProps } from "./Rule";
export { IconButton, type IconButtonProps } from "./IconButton";
export { StatusBadge, type StatusBadgeProps } from "./StatusBadge";
export { STATUS_PRESENTATION, type StatusPresentation, type StatusTone } from "./statusPresentation";
export {
  Spinner,
  SkeletonText,
  SkeletonCard,
  LoadingRegion,
  type SpinnerProps,
  type SkeletonTextProps,
  type LoadingRegionProps,
} from "./Loading";
