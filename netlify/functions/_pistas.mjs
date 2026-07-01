import { fetchPistasFromSheet, readLocalPistasFallback, selectTodayPista } from "./_content.mjs";

export async function loadPistas() {
  try {
    return await fetchPistasFromSheet();
  } catch (error) {
    console.error("No se pudo leer Google Sheet; usando respaldo local", error);
    return await readLocalPistasFallback();
  }
}

export function getTodayPista(items = []) {
  return selectTodayPista(items);
}
