import { json, options } from "./_utils.mjs";
import { fetchContent } from "./_content.mjs";

export default async function handler(req) {
  if (req.method === "OPTIONS") return options();
  if (req.method !== "GET") return json({ ok: false, error: "Método no permitido" }, 405);

  try {
    const force = new URL(req.url).searchParams.get("force") === "1";
    const content = await fetchContent({ force });
    return json(content);
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: error.message }, 500);
  }
}
