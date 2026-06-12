import { createECDH } from "crypto";
import { json, options, vapidEnv } from "./_utils.mjs";

function b64urlToBuffer(value) {
  const text = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(text + "=".repeat((4 - text.length % 4) % 4), "base64");
}

function b64url(buffer) {
  return Buffer.from(buffer).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function publicFromPrivate(privateKey) {
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(b64urlToBuffer(privateKey));
  return b64url(ecdh.getPublicKey(null, "uncompressed"));
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return options();
  const { publicKey, privateKey, subject } = vapidEnv();
  let derivedPublicKey = "";
  let keysMatch = false;
  let privateKeyLooksValid = false;
  let error = "";
  try {
    if (privateKey) {
      const raw = b64urlToBuffer(privateKey);
      privateKeyLooksValid = raw.length === 32;
      derivedPublicKey = publicFromPrivate(privateKey);
      keysMatch = derivedPublicKey === publicKey;
    }
  } catch (e) {
    error = e?.message || String(e);
  }

  return json({
    ok: true,
    publicKeyPresent: Boolean(publicKey),
    publicKeyLength: publicKey.length,
    publicKeyStarts: publicKey ? publicKey.slice(0, 8) : "",
    privateKeyPresent: Boolean(privateKey),
    privateKeyLength: privateKey.length,
    privateKeyLooksValid,
    subjectPresent: Boolean(subject),
    subject,
    keysMatch,
    derivedPublicKeyStarts: derivedPublicKey ? derivedPublicKey.slice(0, 8) : "",
    error
  });
}
