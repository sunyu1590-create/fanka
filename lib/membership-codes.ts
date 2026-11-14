import { createHash, randomInt } from "node:crypto";

const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateMembershipCode() {
  const raw = Array.from({ length: 12 }, () => alphabet[randomInt(alphabet.length)]);
  return `HEIKA-${raw.slice(0, 4).join("")}-${raw.slice(4, 8).join("")}-${raw.slice(8).join("")}`;
}

export function hashMembershipCode(code: string) {
  return createHash("sha256").update(code, "utf8").digest("hex");
}
