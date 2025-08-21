import { NextRequest } from "next/server"
import Papa from "papaparse"

const CANDIDATE_URLS = [
  { url: process.env.NEXT_SHEET_GVIZ_URL as string, label: "gviz" },
  { url:  process.env.NEXT_SHEET_EXPORT_URL as string, label: "export" },
]

function proxify(url: string) {
  // This proxy keeps the raw body and adds permissive CORS headers
  return `https://cors.isomorphic-git.org/${encodeURIComponent(url)}`
}

function isLikelyCsv(text: string) {
  const sample = text.slice(0, 4000)
  // Reject known non-CSV wrappers
  if (/^Title:|^URL Source:|^Markdown Content:/m.test(sample)) return false
  // Accept if we find commas/semicolons/tabs in the first few lines
  const lines = sample.split(/\r?\n/).slice(0, 6)
  return lines.some((l) => /[,;\t]/.test(l))
}

async function fetchRaw(url: string) {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "text/csv, text/plain, */*" },
    redirect: "follow",
  })
  if (!res.ok) throw new Error(`Status ${res.status}`)
  return await res.text()
}

export async function GET(_req: NextRequest) {
  const attempts: { url: string; label: string; body?: string; error?: string }[] = []
  try {
    // Try direct candidates
    for (const c of CANDIDATE_URLS) {
      try {
        const body = await fetchRaw(c.url)
        if (isLikelyCsv(body)) {
          return parseAndRespond(body, c.label, c.url)
        }
        attempts.push({ url: c.url, label: c.label, body: body.slice(0, 120) })
      } catch (e: any) {
        attempts.push({ url: c.url, label: c.label, error: String(e?.message ?? e) })
      }
    }

    // Try proxied candidates
    for (const c of CANDIDATE_URLS) {
      const proxiedUrl = proxify(c.url)
      try {
        const body = await fetchRaw(proxiedUrl)
        if (isLikelyCsv(body)) {
          return parseAndRespond(body, `proxy-${c.label}`, c.url)
        }
        attempts.push({ url: proxiedUrl, label: `proxy-${c.label}`, body: body.slice(0, 120) })
      } catch (e: any) {
        attempts.push({ url: proxiedUrl, label: `proxy-${c.label}`, error: String(e?.message ?? e) })
      }
    }

    // TODO: If none worked, we could show a fallback UI or a message
    return new Response(JSON.stringify({ error: "No CSV válido recibido", attempts }), { status: 502 })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: "Error inesperado", details: String(e?.message ?? e) }), { status: 500 })
  }
}

function parseAndRespond(csv: string, source: string, fetchedUrl: string) {
  // Remove potential BOM
  const clean = csv.replace(/^\uFEFF/, "")
  const parsed = Papa.parse(clean, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  })

  if (parsed.errors && parsed.errors.length > 0) {
    console.warn("CSV parse warnings:", parsed.errors.slice(0, 3))
  }

  const rows = (parsed.data as any[]).map((r) => {
    const obj: Record<string, string> = {}
    Object.keys(r).forEach((k) => {
      const v = r[k]
      obj[String(k)] = v == null ? "" : String(v)
    })
    return obj
  })

  const headers =
    parsed.meta.fields && parsed.meta.fields.length > 0
      ? (parsed.meta.fields as string[])
      : Object.keys(rows[0] ?? {})

  return Response.json({ headers, rows, source, fetchedUrl })
}
