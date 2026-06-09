import { json, options, env } from "./_utils.mjs";

export default async function handler(req) {
  if (req.method === "OPTIONS") return options();
  const publicKey = String(env("VAPID_PUBLIC_KEY") || "").trim().replace(/^VAPID_PUBLIC_KEY\s*=\s*/i, "").replace(/^'[\s\S]*'$/g, (m) => m.slice(1, -1)).replace(/^"[\s\S]*"$/g, (m) => m.slice(1, -1)).replace(/\s+/g, "");
  if (!publicKey) return json({ error: "Falta VAPID_PUBLIC_KEY en Netlify" }, 500);
  return json({ publicKey });
}
