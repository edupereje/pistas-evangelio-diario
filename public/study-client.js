function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function createStudyClient(fetcher, endpoint = "/api/estudios") {
  const summaries = new Map();

  async function request(fecha, summary) {
    if (!validDate(fecha)) return { status: "missing" };
    try {
      const response = await fetcher(`${endpoint}?fecha=${encodeURIComponent(fecha)}${summary ? "&resumen=1" : ""}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" }
      });
      if (response.status === 404) return { status: "missing" };
      if (!response.ok) return { status: "error" };
      const data = await response.json();
      const item = data?.item;
      if (data?.ok !== true || item?.fecha !== fecha ||
          typeof item.cita !== "string" || typeof item.titulo !== "string" ||
          (!summary && (typeof item.contenidoMarkdown !== "string" || !item.contenidoMarkdown.trim()))) {
        return { status: "error" };
      }
      return { status: "ready", item: summary
        ? { fecha, cita: item.cita, titulo: item.titulo }
        : { fecha, cita: item.cita, titulo: item.titulo, contenidoMarkdown: item.contenidoMarkdown } };
    } catch (_) {
      return { status: "error" };
    }
  }

  return {
    summary(fecha) {
      if (!summaries.has(fecha)) summaries.set(fecha, request(fecha, true));
      return summaries.get(fecha);
    },
    async read(fecha) {
      // Releer al abrir evita conservar un estudio que se haya retirado de publicación.
      const result = await request(fecha, false);
      if (result.status === "missing") summaries.set(fecha, Promise.resolve(result));
      return result;
    }
  };
}
