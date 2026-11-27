// A photo sent from this phone keeps showing its local copy after the upload
// (web lib/chatPreview), so a sent picture never blanks and reloads.
const previews = new Map<string, string>();

export function rememberPreview(storedUrl: string | null | undefined, localUri: string) {
  if (storedUrl) previews.set(storedUrl, localUri);
}

export const shownPhoto = (url: string) => previews.get(url) ?? url;
