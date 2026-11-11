// Vigilancia nocturna: revisa cada sitio de vigilancia/sitios.txt con el MISMO analizador de la página,
// dos veces (como navegador y como Googlebot, para detectar cloaking), guarda datos/vigilancia.json
// y escribe en stdout las acciones de aviso (ABRIR/CERRAR<TAB>título<TAB>texto) para el workflow.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { analizar, dominio } from '../js/analizador.js';

const RAIZ = new URL('../', import.meta.url);
const NAVEGADOR = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 (me-hackearon; vigilancia de sitios propios)';
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const pausa = ms => new Promise(r => setTimeout(r, ms));

async function pedir(url, ua) {
  const r = await fetch(url, { headers: { 'User-Agent': ua }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
  const cab = {}; r.headers.forEach((v, k) => { cab[k] = v; });
  return { estado: r.status, cab, texto: (await r.text()).slice(0, 3e6), final: r.url };
}

export async function revisar(url, ultimaWP) {
  const normal = await pedir(url, NAVEGADOR); await pausa(1000);
  const bot = await pedir(url, GOOGLEBOT); await pausa(1000);
  const extras = [];
  for (const ruta of ['/wp-json/wp/v2/users', '/xmlrpc.php', '/readme.html']) {
    try { const r = await pedir(new URL(ruta, url).href, NAVEGADOR); extras.push([ruta, r.estado, r.texto.slice(0, 4000)]); } catch { extras.push([ruta, 0, '']); }
    await pausa(1000);
  }
  return analizar({ html: normal.texto, url: normal.final || url, cabeceras: normal.cab, extras, htmlBot: bot.texto, ultimaWP });
}

async function main() {
  let ultimaWP = null;
  try { ultimaWP = (await (await fetch('https://api.wordpress.org/core/version-check/1.7/')).json()).offers[0].current; } catch { /* sin dato */ }
  if (ultimaWP) writeFileSync(new URL('datos/wordpress.json', RAIZ), JSON.stringify({ ultima: ultimaWP, revisado: new Date().toISOString() }, null, 1) + '\n');
  const sitios = readFileSync(new URL('vigilancia/sitios.txt', RAIZ), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const previo = existsSync(new URL('datos/vigilancia.json', RAIZ)) ? JSON.parse(readFileSync(new URL('datos/vigilancia.json', RAIZ))) : { sitios: [] };
  const salida = [];
  for (const url of sitios) {
    const antes = previo.sitios.find(s => s.url === url) || {};
    try {
      const r = await revisar(url, ultimaWP);
      salida.push({ url, revisado: new Date().toISOString(), veredicto: r.veredicto, hallazgos: r.hallazgos.filter(h => h.gravedad !== 'info').length,
        graves: r.hallazgos.filter(h => ['critica', 'alta'].includes(h.gravedad)).map(h => h.titulo), cloaking: r.hallazgos.some(h => h.id === 'cloaking'), fallos_seguidos: 0 });
    } catch (e) {
      salida.push({ ...antes, url, revisado: new Date().toISOString(), veredicto: antes.veredicto || { clave: 'limpia', texto: 'Sin datos' }, error: String(e.message || e).slice(0, 120), fallos_seguidos: (antes.fallos_seguidos || 0) + 1 });
    }
  }
  writeFileSync(new URL('datos/vigilancia.json', RAIZ), JSON.stringify({ actualizado: new Date().toISOString(), sitios: salida }, null, 1) + '\n');
  // Avisos: un issue por sitio con signos graves (o que no responde 3 noches); se cierra cuando se recupera.
  for (const s of salida) {
    const titulo = `Alerta de seguridad: ${s.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
    const grave = ['infectada', 'sospechosa'].includes(s.veredicto.clave) && !s.error;
    const caido = (s.fallos_seguidos || 0) >= 3;
    if (grave) console.log(`ABRIR\t${titulo}\t${s.veredicto.texto} en ${s.url}.\\n\\n${s.graves.map(g => '- ' + g).join('\\n')}\\n\\nAbre la herramienta con el marcador en ese sitio para ver la evidencia y cómo arreglarlo. Este issue se cierra solo cuando el sitio quede limpio.`);
    else if (caido) console.log(`ABRIR\t${titulo}\tEl sitio ${s.url} no responde hace ${s.fallos_seguidos} noches: ${s.error}`);
    else if (!s.error) console.log(`CERRAR\t${titulo}\tEl sitio volvió a verse limpio el ${s.revisado.slice(0, 10)}. Cerrado automáticamente.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
