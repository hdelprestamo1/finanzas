// Normalización de textos (§8.7) para comparar nombres, conceptos y reglas.

/** Recorta, pasa a mayúsculas, quita tildes (Á→A, Ñ→N) y une espacios múltiples. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Palabras normalizadas de un texto (para buscar nombres por palabra completa). */
export function palabras(texto: string): string[] {
  return normalizar(texto)
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
}
