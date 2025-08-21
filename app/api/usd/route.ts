export async function GET() {
  const API_URL = process.env.NEXT_DOLAR_API_URL as string;
  
  try {
    const res = await fetch(API_URL, {
      // ensure fresh data
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Dolar API error ${res.status}` }), { status: 502 })
    }
    const data = (await res.json()) as Array<{
      moneda?: string
      casa?: string
      nombre?: string
      compra?: number
      venta?: number
      fechaActualizacion?: string
    }>

    const bolsa =
      data.find((d) => String(d.casa ?? "").toLowerCase() === "bolsa") ??
      data.find((d) => String(d.nombre ?? "").toLowerCase() === "bolsa")

    if (!bolsa || typeof bolsa.venta !== "number") {
      return new Response(JSON.stringify({ error: "No se encontró la cotización 'bolsa'." }), { status: 404 })
    }

    return Response.json({
      source: API_URL,
      moneda: bolsa.moneda ?? "USD",
      casa: bolsa.casa ?? bolsa.nombre ?? "bolsa",
      compra: bolsa.compra ?? null,
      venta: bolsa.venta, // D_hoy
      fechaActualizacion: bolsa.fechaActualizacion ?? null,
      rawCount: Array.isArray(data) ? data.length : 0,
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: "Fallo al obtener dólar", details: String(e?.message ?? e) }), {
      status: 500,
    })
  }
}
