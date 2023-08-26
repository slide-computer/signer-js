export const base64ToBase64url = (value: string) =>
  value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

export const base64urlToBase64 = (value: string) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return base64 + "=".repeat(base64.length % 4);
};
