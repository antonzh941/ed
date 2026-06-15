/** Почта поддержки (единое место для UI и юридических текстов). */
export const SUPPORT_EMAIL = "whzhukov941@gmail.com";

export function supportMailtoHref(subject = "ИзиОГЭ — поддержка") {
  const params = new URLSearchParams({ subject });
  return `mailto:${SUPPORT_EMAIL}?${params.toString()}`;
}
