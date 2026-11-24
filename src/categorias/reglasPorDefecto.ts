// Reglas iniciales por palabra clave sobre el comercio (§9.2). Ampliar aquí.
// Se comparan por PALABRAS COMPLETAS: 'DIA' no casa con 'DIAMANTE', ni 'BP' con 'BPX'.
import { CAT } from './porDefecto'

export const PALABRAS_POR_CATEGORIA: Record<string, string[]> = {
  [CAT.supermercado]: [
    'MERCADONA', 'EROSKI', 'CARREFOUR', 'LIDL', 'DIA', 'BM', 'ALCAMPO', 'AHORRAMAS',
  ],
  [CAT.comidaFuera]: [
    '100 MONTADITOS', 'TELEPIZZA', 'BURGER KING', 'MCDONALDS', 'KEBAB', 'RESTAURANTE',
    'CERVECERIA', 'BAR',
  ],
  [CAT.transporte]: [
    'RENFE', 'CERCANIAS', 'METRO', 'EMT', 'INTERBUS', 'FGV', 'UBER', 'CABIFY', 'BOLT', 'MOVILIDAD',
  ],
  [CAT.viajes]: ['RYANAIR', 'VUELING', 'IBERIA', 'OUIGO', 'IRYO', 'BOOKING', 'AIRBNB'],
  [CAT.gasolina]: ['REPSOL', 'CEPSA', 'BP', 'GALP', 'PLENOIL', 'BALLENOIL'],
  [CAT.suscripciones]: [
    'SPOTIFY', 'NETFLIX', 'HBO', 'DISNEY', 'AMAZON PRIME', 'APPLE.COM/BILL', 'ANTHROPIC',
  ],
}
