import { fetchContent, madridDate } from "./_content.mjs";

export async function getTodayPista(date = new Date()) {
  const today = madridDate(date);
  const { items } = await fetchContent();
  return items.find((p) => p.fecha === today) || items.filter((p) => p.fecha <= today).slice(-1)[0] || items[0];
}
