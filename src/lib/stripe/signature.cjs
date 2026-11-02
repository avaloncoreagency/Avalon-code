"use strict";
// Pure HMAC verification utility; no credentials or network calls.
// Stripe signs the exact raw request body as "<timestamp>.<payload>".
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createHmac, timingSafeEqual } = require("node:crypto");
function verifyStripeSignature(payload, header, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof payload !== "string" || typeof header !== "string" || typeof secret !== "string" || !secret.startsWith("whsec_")) return false;
  const parts = header.split(",").map(x => x.trim());
  const timestampText = parts.find(x => /^t=[0-9]{9,13}$/.test(x))?.slice(2);
  const signatures = parts.filter(x => /^v1=[a-fA-F0-9]{64}$/.test(x)).map(x => x.slice(3));
  if (!timestampText || signatures.length === 0) return false;
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300) return false;
  const expected = createHmac("sha256", secret).update(timestampText + "." + payload, "utf8").digest();
  return signatures.some(sig => {
    const actual = Buffer.from(sig, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}
module.exports = { verifyStripeSignature };
