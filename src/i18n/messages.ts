import type { ParseKeys } from "i18next";

export type MessageNamespace = "common" | "homepage" | "workflow" | "metadata";
export type MessageKey = Extract<
  ParseKeys<readonly ["common", "homepage", "workflow", "metadata"]>,
  `${MessageNamespace}:${string}`
>;
export type MessageValues = Record<string, string | number>;
// The explicit fallback also accepts namespace-bound i18next translators without
// erasing key types: every descriptor key is checked against the resource catalog.
export type MessageTranslator = (
  key: MessageKey,
  options: MessageValues & { defaultValue: string },
) => unknown;

export interface MessageDescriptor {
  key: MessageKey;
  values?: MessageValues;
}

export function message(
  key: MessageKey,
  values?: MessageValues,
): MessageDescriptor {
  return values ? { key, values } : { key };
}

export function translateMessage(
  t: MessageTranslator,
  descriptor: MessageDescriptor,
) {
  return String(
    t(descriptor.key, { ...descriptor.values, defaultValue: descriptor.key }),
  );
}

export function messageId(descriptor: MessageDescriptor) {
  return `${descriptor.key}:${JSON.stringify(descriptor.values ?? {})}`;
}
