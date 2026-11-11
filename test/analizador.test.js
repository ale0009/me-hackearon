import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analizar, estiloOculto, extraerBloque, raiz, compararCloaking, borradorAviso, veredicto } from '../js/analizador.js';

const infectado = readFileSync(new URL('../datos/ejemplo-infectado.txt', import.meta.url), 'utf8');
const ids = r => r.hallazgos.map(h => h.id);

const limpio = `<!doctype html><html lang="es"><head><title>Panadería</title>
<script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script></head>
<body><h1>Pan del día</h1><p>Abrimos de 6 a 8. <a href="https://instagram.com/panaderia">Instagram</a></p>
<div style="display:none" class="menu-movil"><a href="/carta">Carta</a></div></body></html>`;

test('detecta estilos que esconden contenido', () => {
  assert.match(estiloOculto('position: absolute;left: -7449px;top: -6026px'), /fuera de la pantalla/);
  assert.equal(estiloOculto('display:none'), 'display: none');
  assert.equal(estiloOculto('font-size:0;'), 'texto de tamaño 0');
  assert.equal(estiloOculto('left:-20px'), null, 'un desplazamiento pequeño es diseño, no spam');
  assert.equal(estiloOculto('color:red'), null);
});

test('extrae bloques anidados completos', () => {
  const h = '<div a><div b>x</div><a href="https://z.invalid">y</a></div><p>fuera</p>';
  assert.equal(extraerBloque(h, 0, 'div'), '<div a><div b>x</div><a href="https://z.invalid">y</a></div>');
});

test('raíz de dominio, incluidos dominios .com.co', () => {
  assert.equal(raiz('blog.ejemplo.com.co'), 'ejemplo.com.co');
  assert.equal(raiz('www.sub.ejemplo.com'), 'ejemplo.com');
});

test('ejemplo infectado: spam oculto, JS ofuscado, iframe y WordPress viejo', () => {
  const r = analizar({ html: infectado, url: 'https://ejemplo-entidad.invalid/', ultimaWP: '7.1.4' });
  const spam = r.hallazgos.find(h => h.id === 'spam-oculto');
  assert.ok(spam, 'debe encontrar los bloques ocultos');
  assert.equal(spam.cifras.bloques, 3);
  assert.equal(spam.cifras.dominios, 4);
  for (const id of ['js-ofuscado', 'iframe-oculto', 'wp-viejo', 'palabras-spam', 'enlaces-sospechosos', 'wp-plugins']) assert.ok(ids(r).includes(id), id);
  assert.equal(r.veredicto.clave, 'infectada');
  assert.equal(r.hallazgos[0].gravedad, 'critica', 'ordenados por gravedad');
  assert.deepEqual(r.wordpress.plugins.sort(), ['contact-form-7', 'elementor']);
});

test('página limpia: un menú oculto propio no es spam', () => {
  const r = analizar({ html: limpio, url: 'https://panaderia.invalid/' });
  assert.ok(!ids(r).includes('spam-oculto'));
  assert.equal(r.veredicto.clave, 'limpia');
});

test('cabeceras de seguridad y versión del servidor', () => {
  const r = analizar({ html: limpio, url: 'https://panaderia.invalid/', cabeceras: { Server: 'Apache/2.4.29 (Ubuntu)', 'X-Content-Type-Options': 'nosniff' } });
  const c = r.hallazgos.find(h => h.id === 'cabeceras');
  assert.match(c.evidencia[0], /Content-Security-Policy/);
  assert.doesNotMatch(c.evidencia[0], /X-Content-Type-Options/);
  assert.ok(ids(r).includes('version-servidor'));
});

test('rutas públicas de WordPress: usuarios expuestos (anonimizados) y xmlrpc', () => {
  const r = analizar({ html: infectado, url: 'https://ejemplo-entidad.invalid/', extras: [
    ['/wp-json/wp/v2/users', 200, '[{"id":1,"slug":"admin"},{"id":2,"slug":"editora"}]'],
    ['/xmlrpc.php', 405, 'XML-RPC server accepts POST requests only.'],
  ] });
  const u = r.hallazgos.find(h => h.id === 'wp-usuarios');
  assert.match(u.titulo, /2 nombres/);
  assert.doesNotMatch(u.evidencia[0], /admin|editora/, 'no se exponen los nombres completos');
  assert.ok(ids(r).includes('wp-xmlrpc'));
});

test('cloaking: Googlebot recibe spam que la persona no ve', () => {
  assert.equal(compararCloaking(limpio, infectado)[0].id, 'cloaking');
  assert.equal(compararCloaking(limpio, limpio).length, 0);
});

test('idioma ajeno (Japanese keyword hack)', () => {
  const r = analizar({ html: `<html lang="es"><body>${'ブランド品の激安通販サイト'.repeat(6)}</body></html>` });
  assert.ok(ids(r).includes('idioma-ajeno'));
});

test('veredicto y borrador de aviso', () => {
  assert.equal(veredicto([]).clave, 'limpia');
  const r = analizar({ html: infectado, url: 'https://ejemplo-entidad.invalid/' });
  const aviso = borradorAviso(r, 'Firma de prueba');
  assert.match(aviso, /ejemplo-entidad\.invalid/);
  assert.match(aviso, /No intenté acceder/);
  assert.equal(borradorAviso(analizar({ html: limpio })), '', 'sin hallazgos graves no hay aviso');
});

test('el iframe oculto de Google Tag Manager no es un hallazgo', () => {
  const h = '<html><body><noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-X" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript></body></html>';
  assert.ok(!analizar({ html: h, url: 'https://sitio.invalid/' }).hallazgos.some(x => x.id === 'iframe-oculto'));
});
