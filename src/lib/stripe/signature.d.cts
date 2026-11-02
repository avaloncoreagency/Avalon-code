export function verifyStripeSignature(
  payload: string, signatureHeader: string | null, secret: string, nowSeconds?: number
): boolean;
