// Analizador pasivo de signos de infección en una página web. Funciones puras: reciben texto
// (HTML, cabeceras, respuestas de rutas públicas) y devuelven hallazgos. Corre igual en el
// navegador (página y marcador) y en Node (vigilancia nocturna). No ataca ni prueba nada:
// solo lee lo que el sitio ya entrega a cualquier visitante.

export const GRAVEDAD = { critica: 4, alta: 3, media: 2, baja: 1, info: 0 };

const SPAM = [
  'casino', 'slots?', 'tragamonedas', 'apuestas?', 'betting', 'free spins', 'giros gratis', 'poker', 'blackjack', 'ruleta',
  'viagra', 'cialis', 'levitra', 'pharmacy', 'farmacia online', 'payday loan', 'préstamos? rápidos?', 'replica watch',
  'essay writing', 'escort', 'porn', 'xxx', 'crypto ?(signals|bot)', 'bitcoin casino', 'bonus code', 'no deposit',
];
const RE_SPAM = new RegExp(`\\b(?:${SPAM.join('|')})\\b`, 'gi');
const TLD_SOSPECHOSOS = /\.(casino|bet|poker|win|loan|xyz|top|click|icu|cyou|sbs|buzz|rest|monster|shop|online)$/i;
const DOMINIO_SPAM = /(casino|slot|bet|poker|pills?|pharm|viagra|cialis|loan|escort|porn|gambl)/i;
const CDN_CONOCIDOS = /(^|\.)(googleapis\.com|gstatic\.com|google\.com|googletagmanager\.com|google-analytics\.com|jsdelivr\.net|cloudflare\.com|cdnjs\.cloudflare\.com|unpkg\.com|jquery\.com|wp\.com|wordpress\.org|gravatar\.com|youtube\.com|facebook\.net|facebook\.com|twitter\.com|x\.com|instagram\.com|recaptcha\.net|hotjar\.com|clarity\.ms|elfsight\.com|fontawesome\.com|bootstrapcdn\.com|vimeo\.com|cdn\.ampproject\.org|doubleclick\.net|addtoany\.com|tawk\.to)$/i;
const MINEROS = /(coinhive|coin-hive|cryptonight|cryptoloot|webmine|jsecoin|minero\.cc|crypto-loot|webminepool|deepminer|monerominer)/i;
const ETIQUETAS = ['div', 'span', 'p', 'section', 'ul', 'li', 'font', 'aside'];

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const recortar = (s, n = 160) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
const sinEtiquetas = h => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');

export function dominio(url, base) {
  try { return new URL(url, base || 'https://ejemplo.invalid/').hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
}

/** Raíz registrable aproximada (ej.: blog.ejemplo.com.co → ejemplo.com.co). Suficiente para agrupar. */
export function raiz(host) {
  if (!host) return host;
  const p = host.split('.');
  const dobles = /^(com|net|org|gov|edu|co|ac|gob|mil)\.[a-z]{2}$/;
  return p.length > 2 && dobles.test(p.slice(-2).join('.')) ? p.slice(-3).join('.') : p.slice(-2).join('.');
}

/** Devuelve el bloque completo de una etiqueta abierta en `i` (cuenta anidamientos de la misma etiqueta). */
export function extraerBloque(html, i, tag) {
  const re = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = i;
  let prof = 0, m;
  while ((m = re.exec(html))) {
    if (m[0][1] === '/') { if (--prof === 0) return html.slice(i, re.lastIndex); }
    else if (!m[0].endsWith('/>')) prof++;
    if (re.lastIndex - i > 200000) break; // bloque desproporcionado: se corta
  }
  return html.slice(i, Math.min(html.length, i + 5000));
}

/** ¿El estilo en línea esconde el elemento a la vista? Devuelve el motivo o null. */
export function estiloOculto(style) {
  const s = style.toLowerCase().replace(/\s+/g, '');
  const pos = s.match(/(?:left|top|text-indent|margin-left|right):-(\d{3,})px/);
  if (pos && Number(pos[1]) >= 999) return `desplazado ${pos[0].replace(':', ': ')} fuera de la pantalla`;
  if (/display:none/.test(s)) return 'display: none';
  if (/visibility:hidden/.test(s)) return 'visibility: hidden';
  if (/font-size:0(px|em|rem)?(;|$)/.test(s)) return 'texto de tamaño 0';
  if (/(height|width):0(px)?;.*overflow:hidden|overflow:hidden.*(height|width):0(px)?(;|$)/.test(s)) return 'caja de tamaño 0';
  if (/opacity:0(;|$)/.test(s)) return 'opacidad 0';
  return null;
}

function enlaces(html, base) {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const h = dominio(m[1], base);
    if (h && /^https?:/i.test(new URL(m[1], base || 'https://ejemplo.invalid/').protocol)) out.push({ href: m[1], host: h, texto: recortar(sinEtiquetas(m[2]), 80) });
  }
  return out;
}

// ---------------------------------------------------------------------------------------- reglas
function bloquesOcultos(html, base, propio) {
  const bloques = [];
  const re = new RegExp(`<(${ETIQUETAS.join('|')})\\b[^>]*\\bstyle\\s*=\\s*["']([^"']*)["'][^>]*>`, 'gi');
  let m;
  while ((m = re.exec(html))) {
    const motivo = estiloOculto(m[2]);
    if (!motivo) continue;
    const bloque = extraerBloque(html, m.index, m[1]);
    const externos = enlaces(bloque, base).filter(e => raiz(e.host) !== raiz(propio));
    const spam = (sinEtiquetas(bloque).match(RE_SPAM) || []).length;
    if (externos.length || spam) bloques.push({ motivo, externos, spam, muestra: recortar(sinEtiquetas(bloque), 140), etiqueta: m[0].slice(0, 90) });
    re.lastIndex = m.index + bloque.length; // no volver a contar lo de adentro
  }
  if (!bloques.length) return [];
  const dominios = [...new Set(bloques.flatMap(b => b.externos.map(e => raiz(e.host))))];
  return [{
    id: 'spam-oculto', gravedad: 'critica', categoria: 'Spam SEO oculto',
    titulo: `${bloques.length} bloque${bloques.length === 1 ? '' : 's'} oculto${bloques.length === 1 ? '' : 's'} con enlaces o texto de spam`,
    cifras: { bloques: bloques.length, dominios: dominios.length, palabrasSpam: bloques.reduce((a, b) => a + b.spam, 0) },
    evidencia: [
      ...bloques.slice(0, 3).map(b => `${b.etiqueta}… (${b.motivo}): «${b.muestra}»`),
      `Enlaza a ${dominios.length} dominio${dominios.length === 1 ? '' : 's'} externo${dominios.length === 1 ? '' : 's'}: ${dominios.slice(0, 8).join(', ')}${dominios.length > 8 ? '…' : ''}`,
    ],
    dominios,
    porque: 'El visitante no ve estos bloques, pero los buscadores sí. Es la firma típica de una inyección de spam SEO: alguien con acceso al sitio lo usa para dar posicionamiento a casinos, farmacias u otros sitios. Además del daño en Google, indica que el atacante puede modificar la web.',
    arreglo: [
      'Busca de dónde sale el bloque: en el tema (header.php, footer.php, functions.php), en widgets, en el contenido de las entradas o en la tabla de opciones de la base de datos (wp_options).',
      'Restaura los archivos del núcleo de WordPress, el tema y los plugins desde copias oficiales; no edites solo lo visible.',
      'Revisa usuarios administradores desconocidos y cambia todas las contraseñas (WordPress, hosting, FTP/SFTP, base de datos y las claves de wp-config.php).',
      'Actualiza WordPress, el tema y los plugins, y elimina los que no uses.',
      'Cuando esté limpio, pide una revisión en Google Search Console (Seguridad y acciones manuales).',
    ],
  }];
}

function palabrasSpam(html) {
  const texto = sinEtiquetas(html);
  const encontrados = [...texto.matchAll(RE_SPAM)];
  if (encontrados.length < 5) return [];
  const conteo = {};
  for (const e of encontrados) { const k = e[0].toLowerCase(); conteo[k] = (conteo[k] || 0) + 1; }
  const top = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return [{
    id: 'palabras-spam', gravedad: encontrados.length >= 25 ? 'alta' : 'media', categoria: 'Spam SEO',
    titulo: `${encontrados.length} menciones de temas típicos de spam`,
    cifras: { menciones: encontrados.length },
    evidencia: [top.map(([k, n]) => `«${k}» ×${n}`).join(' · '), `Ejemplo: «${recortar(texto.slice(Math.max(0, encontrados[0].index - 60), encontrados[0].index + 80), 140)}»`],
    porque: 'Un sitio institucional o de negocio rara vez habla de casinos, fármacos o préstamos rápidos. Si no es su tema, ese texto lo puso alguien más.',
    arreglo: ['Comprueba si esas palabras aparecen en tu contenido legítimo. Si no, busca su origen con la evidencia de este informe (código del tema, widgets, entradas o base de datos).'],
  }];
}

function enlacesSospechosos(html, base, propio) {
  const ext = enlaces(html, base).filter(e => raiz(e.host) !== raiz(propio));
  const sosp = [...new Set(ext.filter(e => TLD_SOSPECHOSOS.test(e.host) || DOMINIO_SPAM.test(e.host)).map(e => e.host))];
  if (!sosp.length) return [];
  return [{
    id: 'enlaces-sospechosos', gravedad: sosp.length >= 5 ? 'alta' : 'media', categoria: 'Enlaces',
    titulo: `${sosp.length} dominio${sosp.length === 1 ? '' : 's'} enlazado${sosp.length === 1 ? '' : 's'} con nombre o extensión de spam`,
    cifras: { dominios: sosp.length },
    evidencia: [sosp.slice(0, 10).join(', ') + (sosp.length > 10 ? '…' : '')],
    porque: 'Dominios como «.casino», «.bet» o nombres con «slots» o «pharma» son destinos habituales de enlaces inyectados.',
    arreglo: ['Si no los pusiste tú, elimínalos de su origen (tema, widget, entrada o base de datos) y revisa cómo llegaron: casi siempre hay un acceso indebido detrás.'],
  }];
}

function scriptsOfuscados(html, base, propio) {
  const hall = [];
  const ofus = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const codigo = m[2];
    if (!codigo.trim()) continue;
    const señales = [];
    if (/\beval\s*\(\s*(atob|unescape|decodeURIComponent|String\.fromCharCode|function\s*\(p,a,c,k,e)/i.test(codigo)) señales.push('eval sobre texto codificado');
    if ((codigo.match(/String\.fromCharCode\s*\(/gi) || []).length && /fromCharCode\s*\(\s*\d+\s*(,\s*\d+\s*){20,}/.test(codigo)) señales.push('cadena larga de String.fromCharCode');
    if (/(\\x[0-9a-f]{2}){30,}/i.test(codigo)) señales.push('texto en hexadecimal');
    if (/[A-Za-z0-9+/]{600,}={0,2}/.test(codigo) && /atob|base64/i.test(codigo)) señales.push('bloque base64 decodificado en ejecución');
    if (/document\.write\s*\(\s*unescape/i.test(codigo)) señales.push('document.write(unescape(…))');
    if (/(window\.)?location(\.href)?\s*=\s*["']https?:\/\//i.test(codigo) || /location\.replace\s*\(\s*["']https?:/i.test(codigo)) {
      const destino = codigo.match(/["'](https?:\/\/[^"']+)["']/)?.[1];
      if (destino && raiz(dominio(destino)) !== raiz(propio)) señales.push(`redirección a ${dominio(destino)}`);
    }
    if (señales.length) ofus.push(`${señales.join(' + ')}: «${recortar(codigo, 120)}»`);
  }
  if (ofus.length) hall.push({
    id: 'js-ofuscado', gravedad: 'alta', categoria: 'Código inyectado',
    titulo: `${ofus.length} script${ofus.length === 1 ? '' : 's'} en línea con código ofuscado o redirecciones`,
    cifras: { scripts: ofus.length }, evidencia: ofus.slice(0, 4),
    porque: 'El código legítimo casi nunca necesita esconderse. Ofuscarlo es la forma habitual de colar redirecciones, robo de datos o publicidad sin que el dueño lo note.',
    arreglo: ['Identifica qué plugin o archivo imprime ese script (busca un fragmento en los archivos del sitio y en la base de datos).', 'Si no lo reconoces, elimínalo y restaura ese componente desde una copia oficial.'],
  });
  const externos = [];
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    const h = dominio(m[1], base);
    if (h && raiz(h) !== raiz(propio) && !CDN_CONOCIDOS.test(h)) externos.push(h);
  }
  const unicos = [...new Set(externos)];
  const malos = unicos.filter(h => MINEROS.test(h) || TLD_SOSPECHOSOS.test(h) || DOMINIO_SPAM.test(h));
  if (malos.length) hall.push({
    id: 'script-externo-malo', gravedad: 'critica', categoria: 'Código inyectado',
    titulo: `Carga scripts desde dominios sospechosos`, cifras: { dominios: malos.length }, evidencia: malos,
    porque: 'Un script externo corre con todos los permisos de tu página: puede redirigir, minar criptomonedas o robar lo que escriben tus visitantes.',
    arreglo: ['Elimina la etiqueta <script> de su origen y revisa cómo llegó ahí; cambia credenciales.'],
  });
  else if (unicos.length) hall.push({
    id: 'scripts-externos', gravedad: 'info', categoria: 'Inventario',
    titulo: `${unicos.length} dominio${unicos.length === 1 ? '' : 's'} externo${unicos.length === 1 ? ' sirve' : 's sirven'} JavaScript`,
    evidencia: [unicos.slice(0, 12).join(', ')],
    porque: 'No es un problema por sí mismo, pero conviene reconocer cada uno: cualquier dominio de esta lista puede cambiar lo que hace tu página.',
    arreglo: ['Comprueba que reconoces todos. Si alguno no te suena, investígalo.'],
  });
  if (MINEROS.test(html)) hall.push({
    id: 'minero', gravedad: 'critica', categoria: 'Código inyectado', titulo: 'Rastros de un minero de criptomonedas',
    evidencia: [recortar(html.match(new RegExp(`.{0,60}${MINEROS.source}.{0,60}`, 'i'))?.[0] || '', 140)],
    porque: 'Usa el procesador de tus visitantes para minar criptomonedas: vuelve lento el sitio y es un signo claro de intrusión.',
    arreglo: ['Elimina el script y su origen, y trata el sitio como comprometido: credenciales nuevas y archivos restaurados.'],
  });
  return hall;
}

function iframesOcultos(html, base, propio) {
  const malos = [];
  for (const m of html.matchAll(/<iframe\b[^>]*>/gi)) {
    const t = m[0];
    const src = t.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] || '';
    const oculto = /\b(width|height)\s*=\s*["']?[01]["'\s>]/i.test(t) || estiloOculto(t.match(/style\s*=\s*["']([^"']*)/i)?.[1] || '');
    const host = dominio(src, base);
    // El iframe oculto de Google Tag Manager y otros servicios conocidos es legítimo.
    if (oculto && src && raiz(host) !== raiz(propio) && !CDN_CONOCIDOS.test(host)) malos.push(recortar(t, 140));
  }
  if (!malos.length) return [];
  return [{
    id: 'iframe-oculto', gravedad: 'alta', categoria: 'Código inyectado', titulo: `${malos.length} iframe${malos.length === 1 ? '' : 's'} invisible${malos.length === 1 ? '' : 's'} hacia otros dominios`,
    evidencia: malos.slice(0, 4),
    porque: 'Un marco de 0 o 1 píxel carga otra web sin que el visitante lo vea: se usa para fraude de clics, rastreo o descargas maliciosas.',
    arreglo: ['Elimínalo de su origen y revisa qué componente lo imprime.'],
  }];
}

function metaRefresh(html, base, propio) {
  const m = html.match(/<meta[^>]+http-equiv\s*=\s*["']refresh["'][^>]*content\s*=\s*["'][^"']*url=([^"'>\s]+)/i);
  if (!m || raiz(dominio(m[1], base)) === raiz(propio)) return [];
  return [{
    id: 'meta-refresh', gravedad: 'alta', categoria: 'Redirecciones', titulo: `Redirección automática a ${dominio(m[1], base)}`,
    evidencia: [recortar(m[0], 160)],
    porque: 'Lleva al visitante a otro sitio sin que lo pida. Es común en hackeos tipo «gibberish» y en redirecciones a estafas.',
    arreglo: ['Elimina la etiqueta y busca su origen en el tema o en la base de datos.'],
  }];
}

function idiomaAjeno(html) {
  const lang = (html.match(/<html[^>]*\blang\s*=\s*["']([a-z]{2})/i)?.[1] || '').toLowerCase();
  if (['ja', 'zh', 'ko'].includes(lang)) return [];
  const texto = sinEtiquetas(html);
  const cjk = (texto.match(/[぀-ヿ一-鿿가-힯]/g) || []).length;
  if (cjk < 40) return [];
  return [{
    id: 'idioma-ajeno', gravedad: 'alta', categoria: 'Spam SEO', titulo: `${cjk} caracteres en japonés, chino o coreano en una página en «${lang || 'otro idioma'}»`,
    evidencia: [`Ejemplo: «${recortar((texto.match(/[぀-ヿ一-鿿가-힯][^<]{0,60}/) || [''])[0], 80)}»`],
    porque: 'Es la firma del «Japanese keyword hack»: el atacante crea páginas en otro idioma para vender productos falsificados con el buen nombre de tu dominio.',
    arreglo: ['Busca en Google «site:tudominio.com» páginas que no reconozcas.', 'Revisa usuarios y propietarios inesperados en Search Console y elimina las páginas creadas por el atacante.'],
  }];
}

function wordpress(html, extras, ultimaWP) {
  const hall = [];
  const gen = html.match(/<meta[^>]+name\s*=\s*["']generator["'][^>]*content\s*=\s*["']WordPress\s*([\d.]+)/i)?.[1]
    || html.match(/[?&]ver=(\d+\.\d+(?:\.\d+)?)["'][^>]*wp-(?:includes|emoji)/i)?.[1];
  const esWP = gen || /\/wp-(content|includes)\//i.test(html);
  if (!esWP) return { esWP: false, hall };
  if (gen && ultimaWP) {
    const v = s => s.split('.').map(Number);
    const [a1, a2] = v(gen), [b1, b2] = v(ultimaWP);
    const atraso = (b1 - a1) * 10 + (b2 - a2);
    if (atraso > 0) hall.push({
      id: 'wp-viejo', gravedad: atraso >= 3 ? 'alta' : 'media', categoria: 'Higiene de WordPress',
      titulo: `WordPress ${gen}: la versión vigente es ${ultimaWP}`,
      evidencia: [`<meta name="generator" content="WordPress ${gen}">`],
      porque: 'Cada versión corrige fallos de seguridad conocidos y públicos. Mientras más atrasada, más fácil de atacar.',
      arreglo: ['Haz una copia de seguridad y actualiza WordPress, el tema y los plugins.', 'Activa las actualizaciones automáticas de seguridad.'],
    });
  }
  if (gen) hall.push({
    id: 'wp-version-visible', gravedad: 'baja', categoria: 'Higiene de WordPress', titulo: 'La página anuncia su versión de WordPress',
    evidencia: [`WordPress ${gen}`],
    porque: 'No es una falla, pero facilita que un atacante sepa qué vulnerabilidades probar.',
    arreglo: ['Quita la etiqueta «generator» (con un plugin de seguridad o con remove_action(\'wp_head\', \'wp_generator\') en el tema hijo).'],
  });
  const plugins = [...new Set([...html.matchAll(/\/wp-content\/plugins\/([a-z0-9_-]+)\//gi)].map(m => m[1].toLowerCase()))];
  if (plugins.length) hall.push({
    id: 'wp-plugins', gravedad: 'info', categoria: 'Inventario', titulo: `${plugins.length} plugin${plugins.length === 1 ? '' : 's'} visible${plugins.length === 1 ? '' : 's'} desde afuera`,
    evidencia: [plugins.join(', ')],
    porque: 'Los plugins son la principal puerta de entrada en WordPress. Conocer la lista ayuda a revisar si alguno tiene vulnerabilidades publicadas.',
    arreglo: ['Busca cada plugin en el catálogo de vulnerabilidades de WPScan o Wordfence y actualiza o elimina los que tengan fallas.'],
  });
  for (const [ruta, estado, cuerpo] of extras || []) {
    if (/wp-json\/wp\/v2\/users/.test(ruta) && estado === 200 && /"slug"\s*:/.test(cuerpo)) {
      const usuarios = [...cuerpo.matchAll(/"slug"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
      hall.push({
        id: 'wp-usuarios', gravedad: 'media', categoria: 'Higiene de WordPress', titulo: `La API pública lista ${usuarios.length} nombre${usuarios.length === 1 ? '' : 's'} de usuario`,
        evidencia: [`${ruta} → ${usuarios.slice(0, 5).map(u => u[0] + '•••').join(', ')}`],
        porque: 'Con los nombres de usuario, un atacante solo tiene que adivinar la contraseña: facilita los ataques de fuerza bruta.',
        arreglo: ['Restringe /wp-json/wp/v2/users a usuarios autenticados (plugin de seguridad o filtro rest_endpoints).', 'Usa contraseñas largas y doble factor para todas las cuentas con permisos.'],
      });
    }
    if (/xmlrpc\.php/.test(ruta) && [200, 405].includes(estado) && /XML-RPC/i.test(cuerpo)) hall.push({
      id: 'wp-xmlrpc', gravedad: 'baja', categoria: 'Higiene de WordPress', titulo: 'xmlrpc.php está activo',
      evidencia: [`${ruta} → HTTP ${estado}: «${recortar(cuerpo, 60)}»`],
      porque: 'Permite probar muchas contraseñas en una sola petición y se abusa para ataques de amplificación.',
      arreglo: ['Si no usas la app móvil ni Jetpack, desactívalo (plugin de seguridad o regla en el servidor).'],
    });
    if (/readme\.html/.test(ruta) && estado === 200 && /WordPress/i.test(cuerpo)) hall.push({
      id: 'wp-readme', gravedad: 'baja', categoria: 'Higiene de WordPress', titulo: 'readme.html de la instalación sigue publicado',
      evidencia: [`${ruta} → HTTP 200`],
      porque: 'Revela que es WordPress y a veces la versión.',
      arreglo: ['Bórralo del servidor (se vuelve a crear al actualizar: inclúyelo en tu rutina).'],
    });
  }
  return { esWP: true, version: gen || null, plugins, hall };
}

function cabeceras(cab, url) {
  if (!cab || !Object.keys(cab).length) return [];
  const c = Object.fromEntries(Object.entries(cab).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const faltan = [];
  if (!c['content-security-policy']) faltan.push('Content-Security-Policy');
  if (!c['x-frame-options'] && !/frame-ancestors/i.test(c['content-security-policy'] || '')) faltan.push('X-Frame-Options (o frame-ancestors)');
  if (!c['x-content-type-options']) faltan.push('X-Content-Type-Options');
  if (/^https:/i.test(url || '') && !c['strict-transport-security']) faltan.push('Strict-Transport-Security');
  if (!c['referrer-policy']) faltan.push('Referrer-Policy');
  const hall = [];
  if (faltan.length) hall.push({
    id: 'cabeceras', gravedad: faltan.length >= 4 ? 'media' : 'baja', categoria: 'Configuración del servidor',
    titulo: `Faltan ${faltan.length} cabeceras de seguridad`, evidencia: [faltan.join(', ')],
    porque: 'Las cabeceras de seguridad limitan el daño si alguien logra inyectar código (CSP) o enmarcar tu sitio para engañar a tus visitantes.',
    arreglo: ['Agrégalas en el servidor o con un plugin de seguridad. Empieza por X-Content-Type-Options: nosniff y Referrer-Policy: strict-origin-when-cross-origin, que no rompen nada.'],
  });
  const fuga = [c['server'], c['x-powered-by']].filter(v => v && /\d/.test(v));
  if (fuga.length) hall.push({
    id: 'version-servidor', gravedad: 'baja', categoria: 'Configuración del servidor', titulo: 'El servidor anuncia versiones de su software',
    evidencia: fuga, porque: 'Ayuda a un atacante a elegir qué fallas probar.', arreglo: ['Oculta la versión (ServerTokens Prod en Apache, server_tokens off en Nginx, expose_php = Off en PHP).'],
  });
  return hall;
}

function contenidoMixto(html, url) {
  if (!/^https:/i.test(url || '')) return [];
  const mixtos = [...new Set([...html.matchAll(/<(?:script|iframe|link|img)\b[^>]*\b(?:src|href)\s*=\s*["'](http:\/\/[^"']+)/gi)].map(m => dominio(m[1])))].filter(Boolean);
  if (!mixtos.length) return [];
  return [{
    id: 'contenido-mixto', gravedad: 'baja', categoria: 'Configuración del servidor', titulo: `Carga recursos sin cifrar (http://) en una página https`,
    evidencia: [mixtos.slice(0, 6).join(', ')], porque: 'Un recurso sin cifrar puede ser alterado por alguien en la misma red del visitante.',
    arreglo: ['Cambia esas direcciones a https:// o quítalas.'],
  }];
}

/** Compara la versión para Googlebot con la normal: el spam que solo ve el buscador («cloaking»). */
export function compararCloaking(normal, bot) {
  const contar = h => ({ spam: (sinEtiquetas(h).match(RE_SPAM) || []).length, ext: new Set(enlaces(h).map(e => raiz(e.host))).size });
  const a = contar(normal), b = contar(bot);
  if (b.spam - a.spam < 5 && b.ext - a.ext < 5) return [];
  return [{
    id: 'cloaking', gravedad: 'critica', categoria: 'Spam SEO', titulo: 'La página le muestra a Google algo distinto que a las personas',
    evidencia: [`Como navegador: ${a.spam} menciones de spam y ${a.ext} dominios enlazados. Como Googlebot: ${b.spam} y ${b.ext}.`],
    porque: 'Es «cloaking»: el atacante esconde el spam a los visitantes para que el dueño no lo note, pero se lo sirve al buscador.',
    arreglo: ['Revisa el archivo .htaccess, functions.php y los plugins buscando condiciones sobre el «User-Agent» o «Googlebot».', 'Usa «Inspección de URL» en Search Console para ver lo que Google recibe.'],
  }];
}

// ---------------------------------------------------------------------------------------- principal
/**
 * analizar({ html, dom?, url?, cabeceras?, extras?, htmlBot?, ultimaWP? })
 *  html     → la página tal como la entrega el servidor (o el código fuente pegado)
 *  dom      → la página ya pintada en el navegador (captura scripts que inyectan después)
 *  extras   → [[ruta, estadoHTTP, cuerpo]] de rutas públicas (/wp-json/wp/v2/users, /xmlrpc.php, /readme.html)
 *  htmlBot  → la misma página pedida como Googlebot (solo en la vigilancia nocturna)
 */
export function analizar({ html = '', dom = '', url = '', cabeceras: cab = null, extras = [], htmlBot = '', ultimaWP = null } = {}) {
  const propio = dominio(url) || 'ejemplo.invalid';
  const fuentes = [html, dom].filter(Boolean);
  const todo = fuentes.join('\n');
  const vistos = new Set();
  const hall = [];
  const sumar = lista => { for (const h of lista) if (!vistos.has(h.id)) { vistos.add(h.id); hall.push(h); } };
  for (const f of fuentes) {
    sumar(bloquesOcultos(f, url, propio));
    sumar(scriptsOfuscados(f, url, propio));
    sumar(iframesOcultos(f, url, propio));
    sumar(metaRefresh(f, url, propio));
  }
  sumar(palabrasSpam(todo));
  sumar(enlacesSospechosos(todo, url, propio));
  sumar(idiomaAjeno(todo));
  const wp = wordpress(todo, extras, ultimaWP);
  sumar(wp.hall);
  sumar(cabeceras(cab, url));
  sumar(contenidoMixto(html || dom, url));
  if (htmlBot) sumar(compararCloaking(html, htmlBot));
  hall.sort((a, b) => GRAVEDAD[b.gravedad] - GRAVEDAD[a.gravedad]);
  return { url, wordpress: wp.esWP ? { version: wp.version, plugins: wp.plugins } : null, hallazgos: hall, veredicto: veredicto(hall), tamano: todo.length };
}

export function veredicto(hall) {
  const max = Math.max(-1, ...hall.map(h => GRAVEDAD[h.gravedad]));
  if (max >= GRAVEDAD.critica) return { clave: 'infectada', texto: 'Signos claros de infección' };
  if (max >= GRAVEDAD.alta) return { clave: 'sospechosa', texto: 'Señales sospechosas' };
  if (max >= GRAVEDAD.media) return { clave: 'mejorable', texto: 'Sin infección visible, con puntos débiles' };
  return { clave: 'limpia', texto: 'Sin signos de infección visibles desde afuera' };
}

/** Borrador de aviso responsable para el dueño del sitio, a partir de los hallazgos graves. */
export function borradorAviso(res, firma = '') {
  const graves = res.hallazgos.filter(h => GRAVEDAD[h.gravedad] >= GRAVEDAD.alta);
  if (!graves.length) return '';
  const host = dominio(res.url) || 'su sitio web';
  return [
    'Cordial saludo.', '',
    `Les escribo de buena fe para informarles de un posible compromiso de seguridad en ${host}.`, '',
    `Qué encontré (${new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}, revisando solo lo que la página entrega a cualquier visitante):`,
    ...graves.map(h => `- ${h.titulo}. ${h.evidencia[0] ? 'Ejemplo: ' + recortar(h.evidencia[0], 200) : ''}`), '',
    'Recomendaciones orientativas:',
    ...[...new Set(graves.flatMap(h => h.arreglo))].slice(0, 5).map(a => `- ${a}`), '',
    'No intenté acceder a ningún sistema ni hice pruebas distintas de leer la página pública, y no he divulgado este hallazgo.', '',
    'Atentamente,', firma,
  ].join('\n').trim();
}

export { esc };
