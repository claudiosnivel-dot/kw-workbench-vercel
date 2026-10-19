# Spagnolo: guida di stile, glossario e registro (D-47)

Titan SEO parla lo spagnolo di Spagna (`es-ES`) e quello d'America Latina (`es-419`). La localizzazione è semantica:
si scrive la frase come la scriverebbe un prodotto nato in quel mercato, non la traduzione parola per parola
dell'italiano. Guida e glossario sono stati approvati dall'utente con il modulo 47 (2026-10-18).

## Come sono fatti i cataloghi

- `messages/es-ES.json` contiene i testi spagnoli; `messages/es-419.json` contiene **solo le differenze** da es-ES.
- `lib/i18n/catalogs.ts` unisce i cataloghi a livelli: inglese ← es-ES per `es-ES`, inglese ← es-ES ← es-419 per
  `es-419`. Una chiave non ancora tradotta si legge in inglese, mai come chiave del catalogo.
- Namespace tradotti con il modulo 47: `common`, `metadata`, `nav`, `projects`, `jobs`, `results`, `project`,
  `nextStep`, `dashboard`, `keywords`, `plan`, `errors`, `errorPages`. Con il modulo 48: `strategy`, `export`,
  `exportDialog`, `settings`, `integrations` (T-4801) e `auth`, `account`, `billing`, `footer` (T-4802). Gli altri
  (`workspace`, `admin`, `emails`, `marketing`, `pricing`, `legal`, `contact`) arrivano con il modulo 49.
- `tests/unit/i18n-catalog-parity.test.ts` controlla chiavi, valori vuoti, argomenti ICU (anche plural e select) e le
  parole vietate, anche namespace per namespace sul catalogo es-419 letto a livelli; `tests/unit/i18n-es-strings.test.ts`
  controlla alcuni testi del glossario nelle due varianti; `tests/integration/export-es.test.ts` scarica gli export dei
  risultati e della strategia con un utente in es-ES ed es-419.
- Le due lingue restano fuori dai selettori, dalle preferenze salvabili e dal riconoscimento del browser
  (`OFFERED_LOCALES` in `lib/i18n/locale.ts`) finché il modulo 49 non completa i cataloghi (T-4902).

## Guida di stile

1. Intento prima delle parole: la frase si scrive come la scriverebbe un prodotto nato in quel mercato («Trova le
   keyword» diventa «Buscar palabras clave», non una resa parola per parola).
2. Si dà del tú in Spagna e in America Latina; niente vosotros e niente voseo; ustedes solo per più persone.
3. Pulsanti e voci di menu all'infinito («Guardar», «Exportar»), maiuscola solo all'inizio, «¿…?» e «¡…!».
4. Virgolette angolari «…» in entrambe le varianti, come raccomanda la RAE (anche nei testi italiani dell'app).
5. Numeri e date dal formatter di next-intl (dati CLDR): in es-ES `12.345,5` e `19 de octubre de 2026`, senza
   separatore nei numeri di quattro cifre (`1234,5`, norma RAE e CLDR); in es-419 `12,345.5`.
6. Nei dubbi decide l'uso di Google Ads, Search Console e degli strumenti SEO localizzati nella variante.
7. Passato recente: pretérito perfecto in es-ES («No se ha podido…», «Se ha producido un error»), pretérito
   indefinido in es-419 («No se pudo…», «Ocurrió un error»).

## Glossario

Termini approvati con il modulo 47; dove le varianti coincidono la forma vale per entrambe.

- **keyword** → palabra clave, in entrambe. «keyword» resta solo tra parentesi, per esempio il nome di una colonna.
- **parole di partenza** → palabras clave semilla, in entrambe.
- **ricerche al mese** → volumen de búsqueda mensual, in entrambe; «búsquedas al mes» nelle colonne strette.
- **pagina principale (hub)** → página pilar; **approfondimento (spoke)** → artículo satélite, in entrambe.
- **argomento** → tema; **piano dei contenuti** → plan de contenidos, in entrambe.
- **tieni / scarta** → conservar / descartar, in entrambe.
- **caricare un file** → subir un archivo in Spagna, cargar un archivo in America Latina.
- **costi** → costes in Spagna, costos in America Latina.
- **impostazioni** → Ajustes in Spagna, Configuración in America Latina.
- **computer / cellulare** → ordenador / móvil in Spagna, computadora / celular in America Latina.
- **email** → correo electrónico; **workspace** → espacio de trabajo, in entrambe.
- **Da scrivere / In scrittura / Pubblicata** → Por escribir / En redacción / Publicada, in entrambe.
- **Keyword Planner** → Planificador de palabras clave, in entrambe.

## Fonti della terminologia

- Google Ads in spagnolo: «Planificador de palabras clave», con le due scelte «Descubrir nuevas palabras clave» e
  «Consultar el volumen de búsqueda y las previsiones» (guide in spagnolo di Platzi e Metricool consultate il
  2026-10-19; da riscontrare sull'interfaccia di Google Ads nella prima rilettura madrelingua).
- Search Console e gli strumenti SEO in spagnolo: «palabra clave», «volumen de búsqueda», «intención de búsqueda»,
  «enlaces internos».
- Diccionario panhispánico de dudas (RAE) per le virgolette, i numeri e le abbreviazioni («p. ej.», «n.º»).

## Registro delle scelte

| Termine | Variante | Scelta | Motivo |
|---|---|---|---|
| estrazione / ricerca (il lavoro in background) | entrambe | búsqueda | è la parola che l'utente vede già nei testi («Iniciar la búsqueda»); «extracción» suona tecnica |
| Annulla / annullata | entrambe | Cancelar / cancelada | uso comune dei prodotti in spagnolo; «Anular» è più formale |
| Impostazioni | es-ES / es-419 | Ajustes / Configuración | glossario |
| aggiungere | es-ES / es-419 | añadir / agregar | «agregar» è la forma abituale in America Latina |
| caricare (un file) | es-ES / es-419 | subir / cargar | glossario («súbelo» / «cárgalo») |
| scaduto (link, sessione) | es-ES / es-419 | caducado / vencido | uso di ciascun mercato |
| contatta l'amministratore | es-ES / es-419 | Ponte en contacto con / Comunícate con | registro dei due mercati |
| partono da (queste parole) | es-ES / es-419 | empiezan por / empiezan con | reggenza abituale in ciascun mercato |
| periodo | es-ES / es-419 | periodo / período | entrambe ammesse dalla RAE, la seconda più usata in America Latina |
| checklist | es-ES / es-419 | lista de comprobación / lista de verificación | uso di ciascun mercato |
| scarpe (esempio del campo) | es-ES / es-419 | zapatillas / tenis | uso di ciascun mercato |
| esempi dell'avvio rapido | es-ES / es-419 | casa rural en asturias, dentista en madrid, clases de yoga online / hotel boutique en cartagena, dentista en monterrey, clases de yoga en línea | ricerche tipiche di ciascun mercato |
| Il tuo account › Collegamenti | entrambe | Tu cuenta › Conexiones | nomi delle sezioni da usare anche nel modulo 48 |
| Fatturazione | entrambe | Facturación | pagina del piano, da usare anche nel modulo 48 |
| dashboard | entrambe | panel | parola comune degli strumenti in spagnolo |
| bacheca / elenco | entrambe | Tablero / Lista | come gli strumenti di progetto in spagnolo |
| unisci | entrambe | Fusionar | azione su due pagine del piano |
| scaletta | entrambe | esquema | testo dei titoli H2 della pagina |
| AI | entrambe | IA | sigla spagnola |
| verifica anti-bot | entrambe | verificación antibots | prefisso «anti» unito alla parola, norma RAE |
| Accedi / Esci | entrambe | Iniciar sesión / Cerrar sesión | forma dei prodotti in spagnolo (Google, Microsoft); «Acceder» suona formale |
| Password dimenticata? | entrambe | ¿Olvidaste tu contraseña? | fissata da AC-4802-1 per le due varianti; in Spagna è comune anche «¿Has olvidado tu contraseña?» |
| email (indirizzo) / password | entrambe | correo electrónico / contraseña | glossario; «correo» da solo quando il contesto è chiaro |
| Il tuo account | entrambe | Tu cuenta | come `nav.yourAccount` e il registro del modulo 47 (il modulo 48 diceva «Mi cuenta») |
| Branding / logo | entrambe | Imagen de marca / logotipo | parole comuni dei pannelli in spagnolo |
| Ricerche mensili medie (export) | es-ES / es-419 | Volumen de búsqueda mensual medio / promedio | glossario; «promedio» è la forma abituale in America Latina |
| Offerta minima e massima inizio pagina | entrambe | Puja por la parte superior de la página, intervalo bajo / alto | nomi delle colonne del Planificador di Google Ads in spagnolo |
| Score / Origine score | entrambe | Puntuación / Origen de la puntuación | come la colonna della pagina delle keyword |
| Strategia hub and spoke (PDF) | entrambe | Estrategia de páginas pilar y artículos satélite | glossario (hub e spoke); niente termini inglesi nel documento per il cliente |
| modelli dei titoli (strategy.templates) | entrambe | ranking, comparación, en línea, «Nuestro criterio de selección» | forme valide nei due mercati: «comparativa» e «online» sono soprattutto di Spagna; il codice che li usa arriva con T-5101 |
| Excel italiano (punto e virgola) | entrambe | Excel (punto y coma) | il separatore conta, non la lingua di Excel (in Messico Excel usa la virgola) |
| Gestisci (fatturazione) | es-ES / es-419 | Gestionar / Administrar | uso di ciascun mercato |
| pagamento scaduto | es-ES / es-419 | pago pendiente / pago vencido | uso di ciascun mercato |
| Disdici / disdetta | entrambe | Cancelar / cancelación | parola dei portali di pagamento in spagnolo |
| Premi (un pulsante) | es-ES / es-419 | Pulsa / Haz clic en | uso di ciascun mercato |
| Supporto | entrambe | Soporte | come `nav.support` |
| campi OAuth di Google | entrambe | ID de cliente, Secreto de cliente, URI de redirección | nomi della console di Google Cloud in spagnolo |
| Free (piano) | entrambe | Free | nome del piano, come in italiano |
