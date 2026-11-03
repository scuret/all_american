import { randomBytes } from "crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Short, URL-safe, time-sortable-ish id. */
export function createId(): string {
  const t = Date.now().toString(36);
  const bytes = randomBytes(10);
  let r = "";
  for (let i = 0; i < bytes.length; i++) r += ALPHABET[bytes[i] % ALPHABET.length];
  return `${t}${r}`;
}
