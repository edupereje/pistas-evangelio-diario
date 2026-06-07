import { json, options, env } from "./_utils.mjs";

export default async function handler(req) {
  if (req.method === "OPTIONS") return options();
  const publicKey = env("VAPID_PUBLIC_KEY");
  if (!publicKey) return json({ error: "Falta VAPID_PUBLIC_KEY en Netlify" }, 500);
  return json({ publicKey });
}
