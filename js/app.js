import { iniciarTema } from './tema.js';
import { analizar, borradorAviso, dominio, esc } from './analizador.js';

const $ = s => document.querySelector(s);
iniciarTema($('#tema'));

const ETIQUETA = { critica: 'Crítico', alta: 'Alto', media: 'Medio', baja: 'Bajo', info: 'Inventario' };
let ultimaWP = null;
let ultimo = null;

// Versión vigente de WordPress: en vivo (la API admite CORS) o la que guardó la vigilancia nocturna.
const versionWP = (async () => {
  try {
    const r = await fetch('https://api.wordpress.org/core/version-check/1.7/');
    ultimaWP = (await r.json()).offers[0].current;
  } catch {
    try { ultimaWP = (await (await fetch('datos/wordpress.json')).json()).ultima; } catch { /* sin dato: no se compara */ }
  }
  return ultimaWP;
})();

// ------------------------------------------------------------------ pestañas
const tabs = [...document.querySelectorAll('[role="tab"]')];
function elegir(t) {
  tabs.forEach(x => {
    const sel = x === t;
    x.setAttribute('aria-selected', sel); x.tabIndex = sel ? 0 : -1;
    document.getElementById(x.getAttribute('aria-controls')).hidden = !sel;
  });
  if (t.id === 'tab-vigilar') pintarVigilancia();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => elegir(t));
  t.addEventListener('keydown', e => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (d) { const n = tabs[(i + d + tabs.length) % tabs.length]; elegir(n); n.focus(); }
  });
});

// ------------------------------------------------------------------ marcador (bookmarklet)
// Corre en la web revisada: lee el HTML del servidor y el ya pintado, las cabeceras y tres rutas
// públicas de WordPress, abre esta página y le pasa los datos con postMessage. No inyecta código ajeno.
const destino = new URL('./#recibir', location.href).href;
const codigoMarcador = `(async()=>{const T=${JSON.stringify(destino)};let h='',c={};try{const r=await fetch(location.href,{cache:'no-store',credentials:'omit'});r.headers.forEach((v,k)=>c[k]=v);h=await r.text()}catch(e){}const p=async u=>{try{const r=await fetch(u,{credentials:'omit',redirect:'manual'});return[u,r.status,(await r.text()).slice(0,4000)]}catch(e){return[u,0,'']}};const x=await Promise.all(['/wp-json/wp/v2/users','/xmlrpc.php','/readme.html'].map(p));const m={tipo:'me-hackearon',url:location.href,html:h,dom:document.documentElement.outerHTML,cabeceras:c,extras:x};const w=window.open(T,'_blank');if(!w){alert('Permite ventanas emergentes para ver el informe.');return}let n=0,ok=false;addEventListener('message',e=>{if(e.data==='me-hackearon-ok')ok=true});const i=setInterval(()=>{if(ok||++n>40){clearInterval(i);return}try{w.postMessage(m,'*')}catch(e){}},500)})()`;
$('#marcador').href = 'javascript:' + encodeURIComponent(codigoMarcador);
$('#marcador').addEventListener('click', e => { e.preventDefault(); alert('No lo pulses aquí: arrástralo a la barra de favoritos y úsalo estando en la web que quieres revisar.'); });

addEventListener('message', async e => {
  const d = e.data;
  if (!d || d.tipo !== 'me-hackearon' || typeof d.html !== 'string') return;
  try { e.source?.postMessage('me-hackearon-ok', '*'); } catch { /* la ventana de origen pudo cerrarse */ }
  if (ultimo?.url === d.url && ultimo?.tamano) return; // llega varias veces: se procesa una
  await versionWP;
  $('#sello').hidden = true;
  mostrar(analizar({
    html: d.html.slice(0, 3e6), dom: String(d.dom || '').slice(0, 3e6), url: String(d.url || ''),
    cabeceras: d.cabeceras && typeof d.cabeceras === 'object' ? d.cabeceras : null,
    extras: Array.isArray(d.extras) ? d.extras.slice(0, 5) : [], ultimaWP,
  }), 'marcador');
});

// ------------------------------------------------------------------ pegar el código
$('#p-pegar').addEventListener('submit', async e => {
  e.preventDefault();
  const html = $('#codigo').value;
  if (!html.trim()) { $('#codigo').focus(); return; }
  await versionWP;
  $('#sello').hidden = true;
  mostrar(analizar({ html, url: $('#url').value.trim(), ultimaWP }), 'pegado');
});
async function cargarEjemplo() {
  const html = await (await fetch('datos/ejemplo-infectado.txt')).text();
  $('#codigo').value = html; $('#url').value = 'https://ejemplo-entidad.invalid/';
  await versionWP;
  $('#sello').hidden = false;
  mostrar(analizar({ html, url: 'https://ejemplo-entidad.invalid/', ultimaWP: ultimaWP || '7.1.4' }), 'ejemplo');
}
$('#cargar-ejemplo').addEventListener('click', cargarEjemplo);

// ------------------------------------------------------------------ informe
function mostrar(r, origen) {
  ultimo = r;
  const v = r.veredicto;
  const host = dominio(r.url) || 'código pegado';
  $('#veredicto').innerHTML = `<span class="v-${v.clave}">${{ infectada: '¡Infectada!', sospechosa: '¡Ojo!', mejorable: 'Mejorable', limpia: 'Limpia' }[v.clave]}</span>`;
  const n = g => r.hallazgos.filter(h => h.gravedad === g).length;
  $('#resumen').innerHTML = `<p class="explica"><b>${esc(host)}</b>: ${esc(v.texto)}.</p>
    <div class="hud">${['critica', 'alta', 'media', 'baja'].map(g => `<span class="pieza g-${g}"><b>${n(g)}</b> ${ETIQUETA[g].toLowerCase()}</span>`).join('')}
    ${r.wordpress ? `<span class="pieza">WordPress ${esc(r.wordpress.version || '(versión oculta)')}</span>` : ''}</div>
    <p class="ayuda">Fuente: ${origen === 'marcador' ? 'el marcador (página del servidor + página pintada + rutas públicas)' : origen === 'ejemplo' ? 'ejemplo sintético con dominios inventados (.invalid)' : 'código pegado (sin cabeceras ni rutas públicas: usa el marcador para un análisis completo)'}.</p>`;
  $('#hallazgos').innerHTML = r.hallazgos.length ? r.hallazgos.map(h => `
    <li class="hallazgo g-${h.gravedad}">
      <details ${['critica', 'alta'].includes(h.gravedad) ? 'open' : ''}>
        <summary><span class="tag g-${h.gravedad}">${ETIQUETA[h.gravedad]}</span> <span class="cat">${esc(h.categoria)}</span> ${esc(h.titulo)}</summary>
        <div class="cuerpo">
          <h4>Evidencia</h4><ul class="evidencia">${h.evidencia.map(x => `<li><code>${esc(x)}</code></li>`).join('')}</ul>
          <h4>Por qué importa</h4><p>${esc(h.porque)}</p>
          <h4>Cómo arreglarlo</h4><ol class="pasos">${h.arreglo.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
        </div>
      </details>
    </li>`).join('') : '<li class="vacio">No se encontraron signos desde afuera. Igual conviene mantener WordPress y sus plugins al día y revisar por dentro de vez en cuando.</li>';
  const aviso = borradorAviso(r, 'Tu nombre\nTu profesión o cargo');
  $('#aviso').hidden = !aviso;
  $('#aviso-texto').value = aviso;
}

$('#copiar-aviso').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#aviso-texto').value); $('#copiar-aviso').textContent = 'Copiado ✓'; }
  catch { $('#aviso-texto').select(); }
});
$('#descargar').addEventListener('click', () => {
  if (!ultimo) return;
  const r = ultimo;
  const md = [`# ¿Me hackearon? · ${dominio(r.url) || 'código pegado'}`, '', `**Veredicto:** ${r.veredicto.texto}`, `Fecha: ${new Date().toISOString().slice(0, 10)}`, '',
    ...r.hallazgos.flatMap(h => [`## [${ETIQUETA[h.gravedad]}] ${h.titulo}`, '', '**Evidencia**', ...h.evidencia.map(x => `- \`${x.replace(/`/g, "'")}\``), '', `**Por qué importa:** ${h.porque}`, '', '**Cómo arreglarlo**', ...h.arreglo.map((x, i) => `${i + 1}. ${x}`), '']),
    '---', 'Revisión pasiva hecha con ¿Me hackearon? (solo lee lo que la web entrega a cualquier visitante).'].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
  a.download = `informe-${(dominio(r.url) || 'web').replace(/[^a-z0-9.-]/gi, '_')}.md`; a.click(); URL.revokeObjectURL(a.href);
});

// ------------------------------------------------------------------ vigilancia nocturna
let vigilanciaPintada = false;
async function pintarVigilancia() {
  if (vigilanciaPintada) return;
  vigilanciaPintada = true;
  try {
    const v = await (await fetch('datos/vigilancia.json', { cache: 'no-cache' })).json();
    $('#vigilancia').innerHTML = v.sitios.map(s => `<div class="tarjeta v-${s.veredicto.clave}">
      <h3>${esc(s.url.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</h3>
      <p class="meta">${esc(s.veredicto.texto)} · ${s.hallazgos} hallazgo${s.hallazgos === 1 ? '' : 's'}${s.cloaking ? ' · <b>contenido distinto para Google</b>' : ''}</p>
      <p class="meta">Revisado ${new Date(s.revisado).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}${s.error ? ` · error: ${esc(s.error)}` : ''}</p></div>`).join('')
      + `<p class="ayuda">Última vigilancia: ${new Date(v.actualizado).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}.</p>`;
  } catch {
    $('#vigilancia').innerHTML = '<p class="ayuda">Aún no hay resultados de vigilancia.</p>';
  }
}

// ------------------------------------------------------------------ arranque
if (location.hash === '#recibir') {
  $('#veredicto').innerHTML = '<span class="espera">Recibiendo la web…</span>';
  setTimeout(() => { if (!ultimo) $('#veredicto').innerHTML = '<span class="espera">No llegaron datos: vuelve a pulsar el marcador en la web que quieres revisar.</span>'; }, 25000);
} else {
  cargarEjemplo(); // abre en un estado útil, marcado como ejemplo
}
