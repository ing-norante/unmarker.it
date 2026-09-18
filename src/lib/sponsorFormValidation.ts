import { z } from "zod";
import type { TFunction } from "i18next";
import { MAX_ICON_BYTES, sponsorCreativeSchema } from "./sponsorPurchase";

export const sponsorIconSchema = z
  .custom<File>(
    (value) =>
      typeof File !== "undefined" && value instanceof File && value.size > 0,
    "icon_required",
  )
  .refine((file) => !file || file.size <= MAX_ICON_BYTES, "icon_size")
  .refine(
    (file) =>
      !file || ["image/png", "image/jpeg", "image/webp"].includes(file.type),
    "icon_type",
  );

export const sponsorBookingSchema = sponsorCreativeSchema.extend({
  mobileShowUrl: sponsorCreativeSchema.shape.mobileShowUrl.unwrap(),
  icon: sponsorIconSchema,
});

/** Translate schema error codes at render time, including after a language change. */
export function sponsorFieldErrors(errors: unknown[], t: TFunction<"common">) {
  return errors.slice(0, 1).map((error) => {
    const issue = error as { message?: string; maximum?: number } | undefined;
    return {
      message: t(`sponsors.validation.${issue?.message}`, {
        max: issue?.maximum,
        defaultValue: t("sponsors.validation.invalid"),
      }),
    };
  });
}

export function focusInvalidField(root: HTMLElement | null) {
  requestAnimationFrame(() => {
    root?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  });
}

const iconChecks = new WeakMap<
  File,
  Promise<{ message: string } | undefined>
>();
/** The server repeats this check against decoded bytes before accepting the upload. */
export function validateSponsorIcon(file: File | null) {
  if (!sponsorIconSchema.safeParse(file).success || !file)
    return Promise.resolve(undefined);
  let check = iconChecks.get(file);
  if (!check) {
    check = new Promise<{ message: string } | undefined>((resolve) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      const finish = (message?: string) => {
        URL.revokeObjectURL(url);
        resolve(message ? { message } : undefined);
      };
      image.onload = () =>
        finish(
          image.naturalWidth > 1024 || image.naturalHeight > 1024
            ? "icon_dimensions"
            : undefined,
        );
      image.onerror = () => finish("icon_decode");
      image.src = url;
    });
    iconChecks.set(file, check);
  }
  return check;
}
