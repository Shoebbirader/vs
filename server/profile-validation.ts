export function isIndianE164Mobile(value: string) {
  return /^\+91[6-9]\d{9}$/.test(value.trim());
}

export function normalizeIndianE164Mobile(value: string) {
  const normalized = value.trim().replace(/\s/g, "");
  if (!normalized) return null;
  if (!isIndianE164Mobile(normalized)) throw new Error("Use an Indian mobile number in +91XXXXXXXXXX format.");
  return normalized;
}
