import { z } from "zod";

export const SPONSOR_PRICE_CENTS = 50_000;
export const SPONSOR_DURATION_DAYS = 30;
export const MAX_SPONSOR_DESCRIPTION_LENGTH = 90;
export const MAX_ICON_BYTES = 256 * 1024;

export const sponsorCreativeSchema = z.object({
  name: z.string().trim().min(2).max(32),
  url: z
    .string()
    .trim()
    .max(500)
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          ["https:", "http:"].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          url.hostname.includes(".") &&
          url.hostname !== "localhost" &&
          !url.hostname.endsWith(".local")
        );
      } catch {
        return false;
      }
    }),
  description: z.string().trim().min(10).max(MAX_SPONSOR_DESCRIPTION_LENGTH),
});

export type SponsorCreative = z.infer<typeof sponsorCreativeSchema>;
export type PurchaseStatus =
  | "creating"
  | "pending"
  | "active"
  | "expired"
  | "cancelled"
  | "refunded"
  | "disputed"
  | "attention";
export interface SponsorPurchaseStatus {
  id: string;
  status: PurchaseStatus;
  name: string;
  startsAt: string | null;
  expiresAt: string | null;
  checkoutUrl: string | null;
}
