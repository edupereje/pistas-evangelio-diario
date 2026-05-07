import { json, options } from "./_utils.mjs";

export default async function handler(req) {
  if (req.method === "OPTIONS") return options();
  const publicKey = Netlify.env.get("VAPID_PUBLIC_KEY") || process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return json({ error: "Falta VAPID_PUBLIC_KEY en Netlify" }, 500);
  return json({ publicKey });
}
