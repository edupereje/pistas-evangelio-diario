import { fetchPistasFromSheet, selectTodayPista } from "./_content.mjs";

export async function getAllPistas() {
  return await fetchPistasFromSheet();
}

export async function getTodayPista(date = new Date()) {
  const items = await getAllPistas();
  return selectTodayPista(items, date);
}
