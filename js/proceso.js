import { iniciarTema } from './tema.js';
import { barrasH } from './graficas.js';

iniciarTema(document.querySelector('#tema'));
const $ = s => document.querySelector(s);

// Caso real anonimizado (portada de una entidad pública, 11 nov 2026; calculado aquí con el analizador).
$('#g-caso').innerHTML = barrasH([
  { etiqueta: 'Bloques ocultos con spam', valor: 82, clase: 'rojo' },
  { etiqueta: 'Dominios externos (raíz)', valor: 61 },
  { etiqueta: '«casino»', valor: 309, clase: 'oro' },
  { etiqueta: '«free spins»', valor: 56, clase: 'oro' },
  { etiqueta: '«no deposit»', valor: 46, clase: 'oro' },
  { etiqueta: '«slots»', valor: 36, clase: 'oro' },
], { izq: 200, titulo: 'Lo que había escondido en la portada' });

$('#g-tld').innerHTML = barrasH([
  ['.fr', 12], ['.com', 6], ['.uk', 5], ['.bet', 5, 'rojo'], ['.casino', 5, 'rojo'], ['.it', 4], ['.de', 4], ['.org', 3], ['otras (13)', 17],
].map(([e, v, c]) => ({ etiqueta: e, valor: v, clase: c || '' })), { izq: 110, titulo: 'Extensión de los 61 dominios enlazados' });

$('#g-controles').innerHTML = barrasH([
  { etiqueta: 'Caso infectado', valor: 4, texto: 'infectada · 3 graves', clase: 'rojo' },
  { etiqueta: 'Lotería A (WordPress)', valor: 1, texto: 'limpia' },
  { etiqueta: 'Lotería B (WordPress)', valor: 1, texto: 'limpia' },
  { etiqueta: 'Juego nacional', valor: 1, texto: 'limpia' },
  { etiqueta: 'Sitio estático propio', valor: 1, texto: 'limpia' },
  { etiqueta: 'Blog de WordPress.org', valor: 1, texto: 'limpia (tras corregir 1 falso positivo)', clase: 'oro' },
], { izq: 190, titulo: 'Resultado del analizador en el caso y en cinco controles' });
