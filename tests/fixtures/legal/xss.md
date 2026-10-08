---
status: published
version: segnaposto-2026-10-07
last_updated: 2026-10-08
---

# Fixture XSS

Paragrafo prima.

<script>alert(1)</script>

<img src="x" onerror="alert(1)">

Testo con <img src=x onerror=alert(1)> in linea e un [link esterno](https://example.test/pagina).

![immagine](https://example.test/immagine.png)

[link javascript](javascript:alert(1))
