export type ObjectUrlSource = Blob | MediaSource;

export function createObjectUrl(source: ObjectUrlSource) {
  return URL.createObjectURL(source);
}

export function revokeObjectUrl(url: string | null | undefined) {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

export async function withObjectUrl<T>(
  source: ObjectUrlSource,
  callback: (url: string) => Promise<T>,
) {
  const url = createObjectUrl(source);

  try {
    return await callback(url);
  } finally {
    revokeObjectUrl(url);
  }
}
