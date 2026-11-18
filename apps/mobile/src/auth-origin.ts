export function resolveAuthOrigin(
  value: string | undefined,
  development: boolean,
) {
  if (!value || !/^https?:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(value)) return;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" ||
      (development && /^http:\/\/127\.0\.0\.1:\d+\/?$/.test(value))
    )
      return url.origin;
  } catch {
    return undefined;
  }
}

export function sessionStoragePrefix(origin: string) {
  const encoded = Array.from(origin, (character) =>
    character.charCodeAt(0).toString(16).padStart(2, "0"),
  ).join("");
  return `kairn_auth_${encoded}`;
}
