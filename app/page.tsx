"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, Calculator, RefreshCw } from 'lucide-react'

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type Row = Record<string, string>

type ApiResponse = {
  headers: string[]
  rows: Row[]
}

const START_CODE = "S15G5"
const END_CODE = "T15E7"

// Helpers
function normalize(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
}
function normalizeLoose(s: string) {
  return normalize(s).replace(/[.\-_:;"'(){}\[\]%]/g, "").replace(/\s+/g, " ").trim()
}
function parseNumber(raw: unknown): number | null {
  if (raw == null) return null
  let str = String(raw).trim()
  if (!str) return null
  str = str.replace(/[%$]/g, "").replace(/\s/g, "")
  if (str.includes(",") && !str.includes(".")) {
    str = str.replace(/\./g, "")
    str = str.replace(/,/g, ".")
  } else {
    str = str.replace(/,/g, "")
  }
  const num = Number(str)
  return Number.isFinite(num) ? num : null
}
function formatCurrencyARS(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—"
  return v.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 })
}
function formatPercent(v: number | null | undefined, digits = 2) {
  if (v == null || !Number.isFinite(v)) return "—"
  return `${(v * 100).toFixed(digits)}%`
}
function formatDateEs(d: string | null | undefined) {
  if (!d) return "—"
  const raw = String(d).trim()
  const dm = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (dm) {
    const day = Number(dm[1])
    const month = Number(dm[2]) - 1
    const year = Number(dm[3].length === 2 ? "20" + dm[3] : dm[3])
    const date = new Date(year, month, day)
    return isNaN(date.getTime()) ? raw : date.toLocaleDateString("es-AR")
  }
  const date = new Date(raw)
  return isNaN(date.getTime()) ? raw : date.toLocaleDateString("es-AR")
}
function formatMesesFriendly(n?: number | null) {
  if (n == null || !Number.isFinite(n)) return "—"
  if (n < 1) {
    const semanas = Math.max(1, Math.round(n * 10))
    return `${semanas} ${semanas === 1 ? "semana" : "semanas"}`
  }
  if (n >= 12) {
    const years = Math.floor(n / 12)
    const remMonths = Math.floor(n % 12)
    if (remMonths > 0) return `${years} ${years === 1 ? "año" : "años"} ${remMonths} ${remMonths === 1 ? "mes" : "meses"} aprox`
    return `${years} ${years === 1 ? "año" : "años"} aprox`
  }
  const months = Math.floor(n)
  return `${months} ${months === 1 ? "mes" : "meses"} aprox`
}
function formatDiasMeses(diasVal?: unknown, mesesVal?: unknown) {
  const d = parseNumber(diasVal ?? null)
  const m = parseNumber(mesesVal ?? null)
  if (d != null) {
    if (d > 30) {
      const months = Math.round(d / 30)
      return `${months} ${months === 1 ? "mes" : "meses"} aprox`
    }
    return `${Math.round(d)} días`
  }
  if (m != null) return formatMesesFriendly(m)
  return "—"
}
function findByAliases(headers: string[], aliases: string[]) {
  for (const h of headers) {
    const H = normalizeLoose(h)
    for (const alias of aliases) {
      const A = normalizeLoose(alias)
      if (H === A) return h
    }
  }
  for (const h of headers) {
    const H = normalizeLoose(h)
    for (const alias of aliases) {
      const A = normalizeLoose(alias)
      if (H.includes(A) || A.includes(H)) return h
    }
  }
  return null
}
function isLecapCode(str: unknown): boolean {
  const s = String(str ?? "").trim().toUpperCase()
  return /^[ST][A-Z0-9]{4}$/.test(s)
}
function extractTicker(row: Record<string, string>, headerMap?: any, headers?: string[]): string | null {
  const candidates = [headerMap?.ticker, "Ticker", "Código", "Codigo", "Símbolo", "Simbolo", "Especie", "Serie"].filter(Boolean) as string[]
  for (const c of candidates) {
    const val = row[c]
    if (val && isLecapCode(val)) return String(val).trim().toUpperCase()
  }
  const keys = headers && headers.length ? headers : Object.keys(row)
  for (const k of keys) {
    const v = row[k]
    if (!v) continue
    const parts = String(v).split(/[\s,;:/\-\u2013\u2014]+/)
    for (const p of parts) {
      if (isLecapCode(p)) return p.toUpperCase()
    }
    if (isLecapCode(v)) return String(v).trim().toUpperCase()
  }
  return null
}

export default function Page() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [amountInput, setAmountInput] = useState<string>("100000")
  const [calculate, setCalculate] = useState(false)
  const amount = useMemo(() => parseNumber(amountInput) ?? 0, [amountInput])

  // Dólar (bolsa) auto
  const [usdToday, setUsdToday] = useState<number | null>(null)
  const [usdUpdatedAt, setUsdUpdatedAt] = useState<string | null>(null)
  const [usdLoading, setUsdLoading] = useState(false)
  const [usdError, setUsdError] = useState<string | null>(null)

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/lecap", { cache: "no-store" })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const json = (await res.json()) as ApiResponse
      setData(json)
    } catch (e: any) {
      setError("No se pudo cargar el CSV de Google Sheets.")
    } finally {
      setLoading(false)
    }
  }

  async function loadUsd() {
    setUsdLoading(true)
    setUsdError(null)
    try {
      const res = await fetch("/api/usd", { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `Error ${res.status}`)
      setUsdToday(typeof json?.venta === "number" ? json.venta : null)
      setUsdUpdatedAt(json?.fechaActualizacion ?? null)
    } catch (e: any) {
      setUsdError("No se pudo obtener el dólar bolsa automáticamente.")
      setUsdToday(null)
      setUsdUpdatedAt(null)
    } finally {
      setUsdLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    loadUsd()
  }, [])

  // Map desired columns to CSV headers
  const headerMap = useMemo(() => {
    if (!data) return null
    const H = data.headers
    return {
      ticker: findByAliases(H, ["Ticker", "Código", "Codigo", "Símbolo", "Simbolo", "Código LECAP", "Codigo LECAP"]),
      fechaVenc: findByAliases(H, ["Fecha Vencim.", "Fecha de Vencimiento", "Vencimiento", "Fecha Vto", "Fecha Vto.", "F. Venc."]),
      liquiSecu: findByAliases(H, ["Liqui Secu.", "Liqui Secu", "Liquidez Secundaria", "Liquidez"]),
      dias: findByAliases(H, ["Días", "Dias", "Plazo (días)", "Plazo dias", "Días al vencimiento", "Dias al vencimiento"]),
      meses: findByAliases(H, ["Meses", "Plazo (meses)", "Mes"]),
      px: findByAliases(H, ["Px", "Precio Actual", "Precio", "Precio (ARS)", "Último Precio", "Ultimo Precio"]),
      pagoFinal: findByAliases(H, ["PagoFinal", "Pago Final", "Pago Final (ARS)", "Pago Final ARS", "Pago al Vencimiento", "Valor a Cobrar"]),
      tna: findByAliases(H, ["TNA", "Tasa Nominal Anual (TNA)", "Tasa Nominal Anual", "Tasa Nominal"]),
      tem: findByAliases(H, ["TEM", "Tasa Efectiva Mensual"]),
      tea: findByAliases(H, ["TEA", "Tasa Efectiva Anual"]),
    }
  }, [data])

  const priceHeader = headerMap?.px ?? null
  const pagoFinalHeader = headerMap?.pagoFinal ?? null
  const tnaHeader = headerMap?.tna ?? null
  const diasHeader = headerMap?.dias ?? null
  const mesesHeader = headerMap?.meses ?? null
  const fechaHeader = headerMap?.fechaVenc ?? null

  // Rows strictly from S15G5 to T15E7; else, only rows with detected ticker
  const displayRows = useMemo(() => {
    if (!data) return []
    const rowsWithTicker = data.rows.map((r) => ({
      row: r,
      ticker: extractTicker(r, headerMap, data.headers),
    }))
    const idxStart = rowsWithTicker.findIndex((x) => x.ticker === START_CODE)
    const idxEnd = rowsWithTicker.findIndex((x) => x.ticker === END_CODE)
    if (idxStart !== -1 && idxEnd !== -1) {
      const [s, e] = idxStart <= idxEnd ? [idxStart, idxEnd] : [idxEnd, idxStart]
      return rowsWithTicker.slice(s, e + 1).map((x) => x.row)
    }
    return rowsWithTicker.filter((x) => !!x.ticker).map((x) => x.row)
  }, [data, headerMap])

  type Computed = {
    codigo: string
    px: number | null
    pagoFinal: number | null
    tnaPct: number | null
    dias: number | null
    venc: string | null
    finalEstimado: number | null
    breakevenUsd: number | null
  }

  const computedRows: Computed[] = useMemo(() => {
    if (!data) return []
    return displayRows.map((row) => {
      const codigo = extractTicker(row, headerMap, data.headers) || ""
      const px = priceHeader ? parseNumber(row[priceHeader]) : null
      const pagoFinal = pagoFinalHeader ? parseNumber(row[pagoFinalHeader]) : null
      const tnaRaw = tnaHeader ? parseNumber(row[tnaHeader]) : null
      const tnaPct = tnaRaw != null ? (tnaRaw > 1 ? tnaRaw / 100 : tnaRaw) : null
      const dias = diasHeader ? (parseNumber(row[diasHeader]) ? Math.round(parseNumber(row[diasHeader]) as number) : null) : null
      const venc = fechaHeader ? row[fechaHeader] : null

      const finalEstimado = px && px > 0 && pagoFinal && pagoFinal > 0 ? (amount / px) * pagoFinal : null
      const breakevenUsd = usdToday != null && px && px > 0 && pagoFinal && pagoFinal > 0 ? usdToday * (pagoFinal / px) : null

      return { codigo, px: px ?? null, pagoFinal: pagoFinal ?? null, tnaPct, dias, venc, finalEstimado, breakevenUsd }
    })
  }, [amount, data, headerMap, displayRows, priceHeader, pagoFinalHeader, tnaHeader, diasHeader, fechaHeader, usdToday])

  const tableHeaders = ["Ticker", "Fecha Vencim.", "Liqui Secu.", "Días/Meses", "Px", "PagoFinal", "TNA", "TEM", "TEA"]

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-950 dark:to-zinc-900">
      {/* REPLACE */}
      <header className="container mx-auto px-4 md:px-6 py-10">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Cotización de LECAPs en Argentina
          </h1>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            Consulta en tiempo real.
          </p>
        </div>
      </header>

      <main className="container mx-auto px-4 md:px-6 flex-1 grid gap-8 max-w-6xl">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Tabla de cotizaciones</CardTitle>
              <CardDescription>Se muestran únicamente las filas S15G5 a T15E7 y las columnas solicitadas.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
                <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
                Refrescar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pb-6">
            {error && (
              <div className="mb-4 text-sm text-red-600 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="relative overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/40">
                  <TableRow>
                    {tableHeaders.map((h) => (
                      <TableHead key={h} className="whitespace-nowrap">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={tableHeaders.length} className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                        Cargando datos...
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading && data && displayRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={tableHeaders.length} className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                        Sin datos disponibles.
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading &&
                    data &&
                    displayRows.map((row, idx) => {
                      const ticker = extractTicker(row, headerMap, data?.headers) || "—"
                      const fecha = headerMap?.fechaVenc ? formatDateEs(row[headerMap.fechaVenc]) : "—"
                      const liqui = headerMap?.liquiSecu ? row[headerMap.liquiSecu] || "—" : "—"
                      const diasMeses = formatDiasMeses(headerMap?.dias ? row[headerMap.dias] : undefined, headerMap?.meses ? row[headerMap.meses] : undefined)
                      const px = formatCurrencyARS(headerMap?.px ? parseNumber(row[headerMap.px]) : null)
                      const pagoFinal = formatCurrencyARS(headerMap?.pagoFinal ? parseNumber(row[headerMap.pagoFinal]) : null)
                      const tna = formatPercent(
                        headerMap?.tna
                          ? (() => {
                              const n = parseNumber(row[headerMap.tna])
                              return n != null ? (n > 1 ? n / 100 : n) : null
                            })()
                          : null
                      )
                      const tem = formatPercent(
                        headerMap?.tem
                          ? (() => {
                              const n = parseNumber(row[headerMap.tem])
                              return n != null ? (n > 1 ? n / 100 : n) : null
                            })()
                          : null
                      )
                      const tea = formatPercent(
                        headerMap?.tea
                          ? (() => {
                              const n = parseNumber(row[headerMap.tea])
                              return n != null ? (n > 1 ? n / 100 : n) : null
                            })()
                          : null
                      )

                      return (
                        <TableRow key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                          <TableCell className="whitespace-nowrap font-medium">{ticker}</TableCell>
                          <TableCell className="whitespace-nowrap">{fecha}</TableCell>
                          <TableCell className="whitespace-nowrap">{liqui}</TableCell>
                          <TableCell className="whitespace-nowrap">{diasMeses}</TableCell>
                          <TableCell className="whitespace-nowrap">{px}</TableCell>
                          <TableCell className="whitespace-nowrap">{pagoFinal}</TableCell>
                          <TableCell className="whitespace-nowrap">{tna}</TableCell>
                          <TableCell className="whitespace-nowrap">{tem}</TableCell>
                          <TableCell className="whitespace-nowrap">{tea}</TableCell>
                        </TableRow>
                      )
                    })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
            <div>
              <CardTitle>Simulador de rendimiento</CardTitle>
              <CardDescription>Ingrese un monto en pesos y vea el capital final y el dólar breakeven.</CardDescription>
            </div>
            <div className="text-xs text-zinc-600 dark:text-zinc-300">
              {usdLoading ? (
                <span>Cargando dólar bolsa…</span>
              ) : usdError ? (
                <span className="text-red-600">Dólar bolsa: {usdError}</span>
              ) : usdToday != null ? (
                <span>
                  Dólar hoy (bolsa): <strong>{formatCurrencyARS(usdToday)}</strong>
                  {usdUpdatedAt ? ` · ${formatDateEs(usdUpdatedAt)}` : ""}
                </span>
              ) : (
                <span>No disponible el dólar bolsa</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label htmlFor="monto" className="block text-sm font-medium text-zinc-700 dark:text-zinc-200 mb-1">
                  Monto a invertir (ARS)
                </label>
                <Input id="monto" inputMode="decimal" placeholder="Ej: 100000" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button className="w-full sm:w-auto" onClick={() => setCalculate(true)} disabled={amount <= 0 || !data || displayRows.length === 0}>
                  <Calculator className="w-4 h-4 mr-2" />
                  Calcular
                </Button>
              </div>
            </div>

            {calculate && (
              <>
                <div className="text-sm text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-900 border rounded-md p-3">
                  Fórmulas: unidades = monto ÷ Px. Capital final = unidades × PagoFinal. Dólar breakeven = D_hoy × (PagoFinal ÷ Px).
                </div>
                <div className="relative overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/40">
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Código</TableHead>
                        <TableHead className="whitespace-nowrap">Px</TableHead>
                        <TableHead className="whitespace-nowrap">Pago Final</TableHead>
                        <TableHead className="whitespace-nowrap">Plazo (días)</TableHead>
                        <TableHead className="whitespace-nowrap">Fecha Venc.</TableHead>
                        <TableHead className="whitespace-nowrap">Dólar breakeven</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Capital final estimado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {computedRows.map((r, idx) => (
                        <TableRow key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                          <TableCell className="font-medium">{r.codigo || "—"}</TableCell>
                          <TableCell>{formatCurrencyARS(r.px)}</TableCell>
                          <TableCell>{formatCurrencyARS(r.pagoFinal)}</TableCell>
                          <TableCell>{r.dias != null ? `${r.dias} días` : "—"}</TableCell>
                          <TableCell>{formatDateEs(r.venc ?? undefined)}</TableCell>
                          <TableCell>{formatCurrencyARS(r.breakevenUsd)}</TableCell>
                          <TableCell className="text-right">{formatCurrencyARS(r.finalEstimado)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>

      <Separator className="mt-10" />
      <footer className="container mx-auto px-4 md:px-6 py-6">
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">Datos obtenidos de CALCU LETRAS de Cocos – Sin garantía de exactitud</p>
      </footer>
    </div>
  )
}
