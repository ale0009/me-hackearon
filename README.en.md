# ¿Me hackearon? ("Was I hacked?")

**Check whether a WordPress or template website shows signs of compromise, and how to fix it.** It detects hidden SEO spam (casino blocks visitors can't see but Google can), injected code, redirects, cloaking and WordPress hygiene issues. Each finding comes with evidence, why it matters and fix steps.

[Español](README.md) · [How it was made (Spanish)](proceso/)

## Three ways to use it
1. **Bookmarklet:** drag it to your bookmarks bar and click it on the site you want to check. Everything runs in your browser.
2. **Paste the source:** Ctrl+U, copy, paste.
3. **Nightly watch:** GitHub Actions checks `vigilancia/sitios.txt` as a browser and as Googlebot (to catch cloaking). It opens an issue when a site gets worse and closes it once it's clean.

**Passive only:** it reads what the site serves to any visitor. No password guessing, no exploitation. Server-side backdoors are invisible from outside, so check from the inside too if there are signs of infection.

## Origin
Born while building [¿Cayó?](https://github.com/ale0009/cayo-loterias): an official homepage contained 82 hidden blocks with 467 casino mentions linking to 61 domains. The owner was notified privately.

## Credits
[Mario Puerta «ale0009»](https://github.com/ale0009) × [David Rincón «Kuronoma»](https://www.linkedin.com/in/davidalexanderrinconcorredorkuronoma/) · MIT license.
