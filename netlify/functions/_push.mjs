export const SUBSCRIPTIONS = "push-subscriptions";
export const DELIVERIES = "push-delivery-state";

export function readEnv(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || "";
}

export function setupVapid(push, env = readEnv) {
  const publicKey = env("VAPID_PUBLIC_KEY");
  const privateKey = env("VAPID_PRIVATE_KEY");
  const subject = env("VAPID_SUBJECT");
  if (!publicKey || !privateKey || !subject) throw new Error("Configuración de avisos incompleta");
  push.setVapidDetails(subject, publicKey, privateKey);
}

export function validSubscription(subscription) {
  try {
    return new URL(subscription?.endpoint).protocol === "https:" &&
      typeof subscription?.keys?.p256dh === "string" && Boolean(subscription.keys.p256dh) &&
      typeof subscription?.keys?.auth === "string" && Boolean(subscription.keys.auth);
  } catch { return false; }
}
