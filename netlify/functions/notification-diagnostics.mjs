import { json, options } from "./_utils.mjs";

export default async function handler(req) {
  if (req.method === "OPTIONS") return options();

  const publicKey = process.env.VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  const subject = process.env.VAPID_SUBJECT || "";

  return json({
    ok: true,
    generatedAt: new Date().toISOString(),
    vapid: {
      ok: Boolean(publicKey && privateKey && subject),
      publicKeyPresent: Boolean(publicKey),
      privateKeyPresent: Boolean(privateKey),
      subjectPresent: Boolean(subject),
      subject,
      publicKeyLength: publicKey.length,
      privateKeyLength: privateKey.length
    }
  });
}
