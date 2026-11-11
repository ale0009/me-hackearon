# ¿Me hackearon?

**Revisa si una web WordPress o de plantilla muestra signos de hackeo, y cómo arreglarlo.** Detecta spam SEO oculto, como los bloques de casinos que el visitante no ve pero Google sí. También encuentra código inyectado, redirecciones, contenido distinto para Google («cloaking») y fallas de higiene de WordPress. Cada hallazgo trae evidencia, por qué importa y los pasos para arreglarlo.

[English](README.en.md) · [Cómo se hizo](proceso/)

## Tres formas de usarla
1. **Marcador:** arrastra el botón a tus favoritos y púlsalo estando en la web que quieres revisar. Lee la página del servidor y la pintada, las cabeceras y tres rutas públicas de WordPress, y abre el informe. Todo pasa en tu navegador.
2. **Pegar el código:** Ctrl+U en la web, copiar y pegar. Sirve en cualquier dispositivo.
3. **Vigilancia nocturna:** GitHub Actions revisa `vigilancia/sitios.txt` como navegador y como Googlebot. Si un sitio empeora, abre un *issue* (llega por correo) y lo cierra cuando se limpia.

## Qué revisa
| Tipo | Señales |
|---|---|
| Spam SEO oculto | Bloques fuera de pantalla, `display:none` o tamaño 0 **con** enlaces externos o spam |
| Spam SEO | Menciones de casino, apuestas, fármacos y préstamos; dominios .bet o .casino; texto japonés o chino en una web en español |
| Código inyectado | `eval(atob(…))`, `fromCharCode` largos, hexadecimal, iframes invisibles, mineros de criptomonedas, scripts de dominios sospechosos |
| Redirecciones | `meta refresh` y `location` hacia otros dominios |
| Cloaking | Diferencias entre lo que recibe una persona y lo que recibe Googlebot (vigilancia) |
| Higiene de WordPress | Versión frente a la vigente (API de WordPress.org), plugins visibles, usuarios en `/wp-json`, `xmlrpc.php`, `readme.html` |
| Servidor | Cabeceras de seguridad (OWASP), versión del software expuesta, contenido mixto |

**Es pasiva:** solo lee lo que la web entrega a cualquier visitante. No prueba contraseñas ni explota fallas. Desde afuera no se ven las puertas traseras del servidor: si hay signos de infección, revisa también por dentro.

## Uso local
```bash
python3 -m http.server 8000      # http://localhost:8000
node --test                      # pruebas del analizador
node vigilancia/vigilar.mjs      # vigilancia a mano
```

## Vigilar tus sitios
Haz un *fork* (mejor privado), pon tus direcciones en `vigilancia/sitios.txt` y activa Pages con «Source: GitHub Actions». No hace falta nada más: corre cada noche y te avisa por issue.

## De qué trabajo sale
De la construcción de [¿Cayó?](https://github.com/ale0009/cayo-loterias). Una portada oficial tenía 82 bloques ocultos con 467 menciones de casinos y enlaces a 61 dominios. Se avisó en privado a la entidad. La investigación está en [proceso/](proceso/).

## Créditos
[Mario Puerta «ale0009»](https://github.com/ale0009) × [David Rincón «Kuronoma»](https://www.linkedin.com/in/davidalexanderrinconcorredorkuronoma/) · Licencia MIT.
