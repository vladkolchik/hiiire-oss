function sortedShpEntries(shp: Record<string, string>): Array<[string, string]> {
  return Object.entries(shp)
    .filter(([key]) => key.startsWith("Shp_"))
    .sort(([a], [b]) => a.localeCompare(b, "en"));
}

export function encodeRobokassaReceipt(receipt: unknown): string {
  return encodeURIComponent(JSON.stringify(receipt));
}

export function withShpSignatureBase(base: string, shp: Record<string, string>): string {
  const extra = sortedShpEntries(shp).map(([key, value]) => `${key}=${value}`);
  return extra.length ? `${base}:${extra.join(":")}` : base;
}

export function buildCheckoutSignatureBase(input: {
  merchantLogin: string;
  outSum: string;
  invId: number;
  password1: string;
  receipt?: string | null;
  shp?: Record<string, string>;
}): string {
  const receiptSlot = input.receipt ? `:${input.receipt}` : "";
  const base = `${input.merchantLogin}:${input.outSum}:${input.invId}${receiptSlot}:${input.password1}`;
  return withShpSignatureBase(base, input.shp ?? {});
}

export { sortedShpEntries };
