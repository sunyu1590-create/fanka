import assert from "node:assert/strict";
import test from "node:test";
import { generateMembershipCode, hashMembershipCode } from "../lib/membership-codes.ts";

test("membership codes use a cryptographic alphabet and the public redemption format", () => {
  const codes = Array.from({ length: 500 }, generateMembershipCode);
  assert.ok(codes.every((code) => /^HEIKA-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(code)));
  assert.equal(new Set(codes).size, codes.length);
});

test("membership code persistence uses a deterministic SHA-256 digest, not plaintext", () => {
  const code = "HEIKA-7K9P-4M2X-Q8TR";
  const digest = hashMembershipCode(code);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(hashMembershipCode(code), digest);
  assert.notEqual(digest, code);
});
