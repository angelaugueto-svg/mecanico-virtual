import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface CatalogPart {
  code: string;
  description: string;
  compatible: string;
  price: number | null;
  status: string;
  category: string;
  photo: string;
}

const SHEET_ID =
  process.env.CATALOG_SHEET_ID ??
  '1qiTU_xBfl25SEGgIs6FTnmlESaD6oFiPDip9W-Od7PA';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const CACHE_FILE = join(__dirname, '..', '.cache', 'catalog.json');

let cache: { parts: CatalogPart[]; fetchedAt: number } | null = null;

function loadCacheFile(): void {
  if (cache) return;
  try {
    if (existsSync(CACHE_FILE)) {
      cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch {
    cache = null;
  }
}

function saveCacheFile(parts: CatalogPart[]): void {
  try {
    mkdirSync(join(__dirname, '..', '.cache'), { recursive: true });
    writeFileSync(
      CACHE_FILE,
      JSON.stringify({ parts, fetchedAt: Date.now() }),
      'utf8',
    );
  } catch (err) {
    console.warn('[catalog] no se pudo guardar la copia en caché:', err);
  }
}

/** Parser CSV mínimo que respeta comillas dobles y saltos de línea entre comillas. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
  }
  return rows;
}

function rowsToParts(rows: string[][]): CatalogPart[] {
  // Fila 0 = encabezados. Columnas: A Código, B Descripción, C Compatible con,
  // D Precio, E Estado, F Categoría, G Foto.
  const parts: CatalogPart[] = [];
  for (const r of rows.slice(1)) {
    const code = (r[0] ?? '').trim();
    const description = (r[1] ?? '').trim();
    if (!code && !description) continue;
    const priceRaw = (r[3] ?? '').trim().replace(/[$,\s]/g, '');
    const price = priceRaw === '' || Number.isNaN(Number(priceRaw)) ? null : Number(priceRaw);
    parts.push({
      code,
      description,
      compatible: (r[2] ?? '').trim(),
      price,
      status: (r[4] ?? '').trim(),
      category: (r[5] ?? '').trim(),
      photo: (r[6] ?? '').trim(),
    });
  }
  return parts;
}

export async function fetchCatalog(force = false): Promise<CatalogPart[]> {
  loadCacheFile();
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.parts;
  }
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Sheet1&headers=1`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const parts = rowsToParts(parseCsv(text));
    if (parts.length === 0) throw new Error('catálogo vacío');
    cache = { parts, fetchedAt: Date.now() };
    saveCacheFile(parts);
    console.log(`[catalog] actualizado: ${parts.length} repuestos`);
    return parts;
  } catch (err) {
    console.warn('[catalog] lectura en vivo falló, uso última copia:', err);
    if (cache) return cache.parts;
    return [];
  }
}

/** Puntaje simple por coincidencia de palabras en descripción/categoría/código. */
export function searchCatalog(parts: CatalogPart[], query: string, limit = 12): CatalogPart[] {
  const words = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  if (words.length === 0) return [];
  const scored = parts
    .filter((p) => !/agotado/i.test(p.status))
    .map((p) => {
      const hay = `${p.code} ${p.description} ${p.category} ${p.compatible}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
      let score = 0;
      for (const w of words) {
        if (hay.includes(w)) score += w.length > 4 ? 2 : 1;
      }
      return { p, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.p);
  return scored;
}

export function formatPrice(price: number | null): string {
  return price === null ? 'Precio a consultar' : `$${price}`;
}
