/** Event that fires automation rules. Event-driven (not cron). */
export type TriggerType = "ORDER_CREATED" | "ORDER_PAID";

export type Trigger = { type: TriggerType };

/** Currently one action: schedule a follow-up message after a delay. Runs
 *  through the existing Follow-up Engine, so the 24h-window gate still applies. */
export type Action = {
  type: "SCHEDULE_FOLLOWUP";
  delayHours: number;
  message: string;
  category: "TRANSACTIONAL" | "PROMOTIONAL";
};

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  ORDER_CREATED: "เมื่อมีออเดอร์ใหม่",
  ORDER_PAID: "เมื่อลูกค้าชำระเงินแล้ว",
};
