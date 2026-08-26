import { Clock, CheckCircle2, Package, Truck, XCircle } from "lucide-react";
import type { OrderStatus } from "@/lib/orderStatus";

export type StatusTone = "secondary" | "info" | "default" | "success" | "destructive";

export interface StatusPresentation {
  /** Full label, written from the reader's side of the screen. */
  label: string;
  /** Short form for dense rows. */
  short: string;
  tone: StatusTone;
  icon: typeof Clock;
}

/**
 * Canonical presentation of the order lifecycle — shared by StatusBadge
 * and (from 2E) OrderTimeline, so the two can never disagree about what
 * a state is called or coloured.
 *
 * Keys mirror exactly the values the database CHECK constraint and the
 * enforce_order_status_transition trigger permit; see
 * supabase/migrations/20260824120100_order_status_integrity.sql. Typing it
 * as Record<OrderStatus, …> means adding a status there fails the build
 * here until it is handled.
 *
 * Every entry pairs a colour with an icon and a label — status must stay
 * legible to a colour-blind reader and on a phone in direct sunlight.
 */
export const STATUS_PRESENTATION: Record<OrderStatus, StatusPresentation> = {
  pending: { label: "Waiting for a deliverer", short: "Waiting", tone: "secondary", icon: Clock },
  accepted: { label: "Accepted", short: "Accepted", tone: "info", icon: CheckCircle2 },
  picked_up: { label: "Picked up", short: "Picked up", tone: "default", icon: Package },
  out_for_delivery: { label: "On the way", short: "On the way", tone: "default", icon: Truck },
  delivered: { label: "Delivered", short: "Delivered", tone: "success", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", short: "Cancelled", tone: "destructive", icon: XCircle },
};
