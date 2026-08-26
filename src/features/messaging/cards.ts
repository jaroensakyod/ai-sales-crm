/**
 * Channel-agnostic rich-card descriptors. The pipeline builds one of these; each
 * channel renders it its own way (LINE → Flex Message, Facebook → Messenger
 * template). A card always carries a plain-text `fallback` so a channel without
 * card support (or a render failure) can still deliver the message as text.
 *
 * Card buttons carry the SAME `text` a quick-reply chip would send, so tapping a
 * card button routes through the exact same inbound pipeline (e.g. the confirm
 * button sends "ยืนยันสั่งซื้อ" → tryConfirmOrder). No new routing needed.
 */

/** A tappable card button. Exactly one of `text` / `url` / `copy`:
 *  - `text`: sends that message back as if the customer typed it (routes through
 *    the pipeline — used by the confirm button).
 *  - `url`: opens the link (used by merchant-designed promo cards).
 *  - `copy`: copies the string to the clipboard (LINE clipboard action; not
 *    supported on Facebook, where the button is dropped). */
export type CardAction = {
  label: string;
  text?: string;
  url?: string;
  copy?: string;
};

/** Order summary shown when a draft order awaits confirmation. */
export type OrderConfirmCard = {
  kind: "order_confirm";
  title: string;
  productName: string;
  imageUrl?: string | null;
  /** One-line detail, e.g. "จำนวน 1 • รวม 1,790 บาท". */
  detail: string;
  actions: CardAction[];
  fallback: string;
};

/** Payment / transfer instruction card sent after the customer confirms. */
export type PaymentCard = {
  kind: "payment";
  title: string;
  /** e.g. "ยอดชำระ 1,790 บาท". */
  amountLabel: string;
  rows: { label: string; value: string }[];
  note?: string;
  actions?: CardAction[];
  fallback: string;
};

/** Visual preset for a custom card — changes colors/header, not the fields. */
export type FlexStyle = "plain" | "promo" | "minimal";

/** A merchant-designed promo/announcement card (built in the dashboard). */
export type CustomFlexCard = {
  kind: "custom_flex";
  imageUrl?: string | null;
  headline: string;
  body?: string;
  priceLabel?: string;
  style?: FlexStyle;
  /** Optional custom accent colour (hex) overriding the style preset. */
  accentColor?: string | null;
  actions: CardAction[];
  fallback: string;
};

/** Several product bubbles the customer can swipe through (LINE carousel /
 *  Messenger generic template with multiple elements). */
export type CarouselCard = {
  kind: "carousel";
  cards: CustomFlexCard[];
  fallback: string;
};

export type MessageCard =
  | OrderConfirmCard
  | PaymentCard
  | CustomFlexCard
  | CarouselCard;

/** Deliver a rich card to a channel-user. Wired per channel; optional on the
 *  pipeline so channels/tests without card support fall back to text. */
export type SendCardFn = (
  toExternalId: string,
  card: MessageCard,
) => Promise<void>;
