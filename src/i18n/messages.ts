export type MessageNamespace = "common" | "homepage" | "workflow" | "metadata";
export type MessageKey = `${MessageNamespace}:${string}`;
export type MessageValues = Record<string, string | number>;

export interface MessageDescriptor {
  key: MessageKey;
  values?: MessageValues;
}

export function message(key: MessageKey, values?: MessageValues): MessageDescriptor {
  return values ? { key, values } : { key };
}

export function translateMessage(
  t: (key: never, options?: never) => unknown,
  descriptor: MessageDescriptor,
) {
  return String(t(descriptor.key as never, descriptor.values as never));
}

export function messageId(descriptor: MessageDescriptor) {
  return `${descriptor.key}:${JSON.stringify(descriptor.values ?? {})}`;
}
