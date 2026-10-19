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
  `exportDialog`, `settings`, `integrations` (T-4801) e `auth`, `account`, `billing`, `footer` (T-4802). Con il
  modulo 49 (T-4901) gli ultimi: `workspace`, `admin`, `emails`, `marketing`, `pricing`, `legal`, `contact`. Ogni
  namespace dell'italiano ha ora la sua versione spagnola; l'inglese resta il livello di ripiego per le chiavi future.
- `tests/unit/i18n-catalog-parity.test.ts` controlla chiavi, valori vuoti, argomenti ICU (anche plural e select) e le
  parole vietate su tutti i namespace, anche sul catalogo es-419 letto a livelli; `tests/unit/i18n-es-strings.test.ts`
  controlla alcuni testi del glossario nelle due varianti; `tests/integration/export-es.test.ts` scarica gli export dei
  risultati e della strategia con un utente in es-ES ed es-419; `tests/integration/email-es.test.ts` legge l'email di
  recupero della password di un utente es-419; `tests/e2e/i18n-es.spec.ts` apre home, keyword, piano e impostazioni del
  progetto con utenti es-ES ed es-419 e cerca chiavi del catalogo e testi inglesi di ripiego tra le righe visibili.
- Dal modulo 49 (T-4902) le due lingue sono offerte (`OFFERED_LOCALES` in `lib/i18n/locale.ts`): selettori della
  lingua, preferenze dell'account, cookie, riconoscimento dal browser (es ed es-ES → es-ES; es-419, es-US e i paesi
  d'America Latina → es-419) e sito pubblico su `/es` (es-ES) e `/es-419`, con gli hreflang fra le quattro lingue e
  x-default verso la versione inglese, anche nella sitemap.
- Testi legali: `content/legal/es/` (privacy, termini e cookie), comuni a es-ES ed es-419, sono segnaposto come quelli
  italiani e inglesi finché D-15 non fornisce i testi definitivi; `npm run legal:check` li controlla come gli altri.

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
| modelli dei titoli (strategy.templates) | entrambe | ranking, comparación, en línea, «Nuestro criterio de selección» | forme valide nei due mercati: «comparativa» e «online» sono soprattutto di Spagna; usati per i piani in spagnolo da T-5101, con il catalogo del paese |
| Excel italiano (punto e virgola) | entrambe | Excel (punto y coma) | il separatore conta, non la lingua di Excel (in Messico Excel usa la virgola) |
| Gestisci (fatturazione) | es-ES / es-419 | Gestionar / Administrar | uso di ciascun mercato |
| pagamento scaduto | es-ES / es-419 | pago pendiente / pago vencido | uso di ciascun mercato |
| Disdici / disdetta | entrambe | Cancelar / cancelación | parola dei portali di pagamento in spagnolo |
| Premi (un pulsante) | es-ES / es-419 | Pulsa / Haz clic en | uso di ciascun mercato |
| Supporto | entrambe | Soporte | come `nav.support` |
| campi OAuth di Google | entrambe | ID de cliente, Secreto de cliente, URI de redirección | nomi della console di Google Cloud in spagnolo |
| Free (piano) | entrambe | Free | nome del piano, come in italiano |
| saluto delle email | entrambe | «Hola, {name}:» e testo in maiuscola | norma delle lettere in spagnolo (due punti dopo il saluto); in italiano il testo segue la virgola in minuscola |
| workspace › ruoli | entrambe | Propietario, Administrador, Miembro; Rol | come Google Workspace e gli strumenti di progetto in spagnolo |
| Sottoscrittore (ruolo della piattaforma) | entrambe | Suscriptor | ruolo di chi usa l'app senza amministrarla |
| root admin | entrambe | administrador principal | come gli errori del modulo 47 (`FORBIDDEN_FIELD`, `ROOT_ADMIN`) |
| Gestisci / Gestione utenti | es-ES / es-419 | Gestiona, Gestión de usuarios / Administra, Administración de usuarios | come «Gestionar / Administrar» della fatturazione |
| controllo (catalogo dei modelli) | es-ES / es-419 | comprobación, por comprobar / verificación, por verificar | come la lista de comprobación / verificación |
| subito | es-ES / es-419 | enseguida / de inmediato | uso di ciascun mercato |
| Durata media | es-ES / es-419 | Duración media / Duración promedio | come «medio / promedio» degli export |
| Fatto (fine di una finestra) | entrambe | Listo | parola dei pulsanti di chiusura in spagnolo |
| job (indicatori dell'amministrazione) | entrambe | trabajo | «búsqueda» vale per la ricerca dell'utente; tra i job ci sono anche i volumi |
| Titoli con l'AI | entrambe | Títulos con IA | come `plan.ai` («Mejorar los títulos con IA») |
| pagine legali | entrambe | Política de privacidad, Términos del servicio, Política de cookies | titoli abituali dei siti in spagnolo; «Términos del servicio» come il footer |
| percorsi del sito pubblico | es-ES / es-419 | /es / /es-419 | scelta approvata con il modulo 49; x-default verso /en |
| og:locale | es-ES / es-419 | es_ES / es_LA | og:locale vuole lingua_TERRITORIO: es_LA è il codice dello spagnolo d'America Latina usato da Facebook |
| titolo della landing | entrambe | «De unas pocas semillas a palabras clave listas para exportar» | evita «palabras clave semilla a palabras clave listas», ripetitivo |
| Inizia dal tuo primo progetto | es-ES / es-419 | Empieza por / Empieza con | reggenza abituale in ciascun mercato, come «empiezan por / con» |
| ninguno terminado (Job falliti, nessun job concluso) | entrambe | ninguno terminado | passata sulle schermate: «ningún trabajo terminado» andava su due righe nel riquadro grande della Panoramica |
| occhiello della landing | entrambe | Investigación de palabras clave | passata sulle schermate: con «para SEO» a 390 px l'ultima parola andava da sola sulla seconda riga |

## Passata sulle schermate (modulo 49)

Fotografie del 2026-10-19 con utenti es-ES ed es-419, a 1280 px e a 390 px: home, keyword di un tema, piano, impostazioni
del progetto, preferenze dell'account, membri del workspace, Panoramica, Utenti e Impostazioni dell'amministrazione,
landing, prezzi, contatti e privacy. Correzioni di lunghezza nel registro qui sopra (occhiello della landing e
indicatore dei job della Panoramica). Note senza correzione: nella barra laterale del progetto «Palabras clave» va su due
righe accanto a «5 conservadas» (come «Plan de contenidos», si legge bene); i nomi delle lingue delle ricerche
(«Búsquedas en Español (es)») vengono da Intl.DisplayNames con la maiuscola iniziale degli elenchi
(`lib/client/use-locale-options.ts`), non dal catalogo: in spagnolo i nomi delle lingue vanno in minuscolo nel testo
corrente, da decidere con l'utente se cambiarli. Nessuna rilettura
madrelingua (facoltativa, D-47).

## Ricerche in spagnolo (modulo 50)

**Composizioni (T-5001).** Scelte il 2026-10-19 con Google Autocomplete chiamato come fa la ricerca
(`client=firefox`, `hl=es`, `gl=ES` e `gl=MX`) su quattro parole di prova: «cama de hospital», «cafetera», «abogado» e
«curso de inglés». Per ogni candidata si contano i suggerimenti (la query stessa esclusa) e quelli **nuovi**, cioè non
già trovati dalla ricerca di base della stessa parola (parola, parola + a…z, parola + 0…9), che la ricerca fa comunque.
Colonne: totale ES + MX, nuovi ES + MX, poi i conteggi per parola nell'ordine sopra (uguali in ES e in MX: con le
composizioni Google dà gli stessi numeri nei due mercati, mentre le liste cambiano; sulle ricerche di base le due liste
hanno in comune da 188 a 348 suggerimenti su circa 300-390).

| Candidata | Totale | Nuovi | Per parola (ES = MX) | Nuovi ES / MX |
|---|---|---|---|---|
| **qué es {seed}** | 76 | 76 | 10/9/9/10 | 10/9/9/10 · 10/9/9/10 |
| {seed} precios | 66 | 66 | 4/9/10/10 | 4/9/10/10 · 4/9/10/10 |
| **{seed} precio** | 72 | 65 | 9/9/9/9 | 5/9/9/9 · 6/9/9/9 |
| **comprar {seed}** | 64 | 64 | 9/9/10/4 | 9/9/10/4 · 9/9/10/4 |
| **{seed} con** | 78 | 60 | 10/10/10/9 | 5/9/8/8 · 5/8/10/7 |
| **mejor {seed}** | 60 | 60 | 2/9/10/9 | 2/9/10/9 · 2/9/10/9 |
| **tipos de {seed}** | 60 | 60 | 9/10/10/1 | 9/10/10/1 · 9/10/10/1 |
| **{seed} opiniones** | 58 | 58 | 0/9/10/10 | 0/9/10/10 · 0/9/10/10 |
| **{seed} cerca de mí** | 56 | 55 | 1/9/9/9 | 1/8/9/9 · 1/9/9/9 |
| mejores {seed} | 52 | 52 | 0/10/10/6 | 0/10/10/6 · 0/10/10/6 |
| {seed} barato | 52 | 52 | 0/8/9/9 | 0/8/9/9 · 0/8/9/9 |
| {seed} para | 80 | 51 | 10/10/10/10 | 5/10/9/3 · 6/7/9/2 |
| alquiler {seed} | 50 | 50 | 9/7/9/0 | 9/7/9/0 · 9/7/9/0 |
| {seed} oferta | 46 | 46 | 2/9/9/3 | 2/9/9/3 · 2/9/9/3 |
| {seed} en | 80 | 42 | 10/10/10/10 | 6/10/7/0 · 6/9/4/0 |
| {seed} gratis | 56 | 39 | 1/9/9/9 | 1/9/7/2 · 1/9/9/1 |
| {seed} segunda mano | 40 | 39 | 9/9/2/0 | 8/9/2/0 · 9/9/2/0 |
| {seed} reseñas | 38 | 38 | 0/9/9/1 | 0/9/9/1 · 0/9/9/1 |
| {seed} ofertas | 36 | 36 | 0/9/9/0 | 0/9/9/0 · 0/9/9/0 |
| {seed} online | 54 | 35 | 0/9/9/9 | 0/9/8/0 · 0/9/9/0 |
| cómo elegir {seed} | 32 | 32 | 0/10/6/0 | 0/10/6/0 · 0/10/6/0 |
| {seed} vs | 40 | 1 | 0/10/10/0 | 0/0/0/0 · 0/0/1/0 |

Scelta (in grassetto, in `DEFAULT_PATTERNS.es` di `prisma/seed.ts`): le 8 con più suggerimenti nuovi, tutte con
suggerimenti in entrambi i mercati; di due forme della stessa parola resta quella con più suggerimenti in totale
(«precio» e non «precios», «mejor» e non «mejores»). Contare i suggerimenti nuovi invece del totale toglie le
composizioni che ripetono la ricerca di base: «{seed} para» ed «{seed} en» hanno il totale più alto ma da un terzo
a metà dei loro suggerimenti è già nella ricerca di base; «{seed} vs» ne aggiunge uno su 40. Con il solo totale il
set avrebbe «{seed} para» ed «{seed} en» al posto di «{seed} opiniones» e «{seed} cerca de mí».

**Classificazione (T-5001).** Lessico `es` in `lib/modules/classification.ts`: domande all'inizio della keyword (anche
«por qué», di due parole), commerciale, transazionale, locale e strumenti come nel modulo; per ogni parola con
l'accento anche la forma senza («cómo» e «como», «cerca de mí» e «cerca de mi», «reseñas» e «resenas»), come
«perché» e «perche» in italiano. Navigazionale, prodotto, servizio e contenuti seguono l'italiano («iniciar sesión»,
«sitio oficial», «producto», «servicio», «consultoría», «guía», «consejos», «ejemplos»).

**Keyword Planner (T-5002).** Colonne spagnole nel parser (`lib/modules/planner/csv-parser.ts`) dalla guida di Google
Ads in spagnolo (`docs/METRICS-PROVIDERS.md`): la guida chiama la colonna della concorrenza «Competitividad», le guide
di Metricool e Ahrefs «Competencia»: il parser accetta le due, con e senza «(valor indexado)», e il livello «Baja».
Intervalli «10 mil - 100 mil» (mil = migliaia) e «1000 - 10.000». La fixture `tests/fixtures/planner/keyword-planner-es.csv`
è costruita da queste intestazioni: un file reale scaricato in spagnolo la sostituirebbe.

## Piano e titoli in spagnolo (modulo 51)

**Raggruppamento (T-5101).** Lessico `es` in `lib/modules/strategy/modifiers.ts`, nella forma canonica (senza accenti):
parole vuote (el, la, los, las, lo, un, una, unos, unas, de, del, en, para, por, con, a, al, y, e, o, u) e modificatori
nelle cinque categorie del motore: prezzo e acquisto (transactional: precio, barato, económico, oferta, comprar, venta,
alquiler, descuento, rebajas...), qualità e confronto (comparison: mejor, opiniones, reseñas, vs, comparativa,
ranking...), luogo (local: cerca de mí, cerca, cercano, zona), uso e domande (informational: cómo, qué, cuál, cuándo,
dónde, quién, cuánto, guía, consejos...), strumenti (tool: calculadora, generador, simulador, online, en línea, gratis,
gratuito, app, plantilla). «online» e «gratis» stanno fra gli strumenti come in italiano e in inglese: la categoria
sceglie il tipo di contenuto e il modello del titolo. «para» è solo una parola vuota, come «per». Singolare e plurale:
senza la s finale e poi senza la vocale finale se restano almeno 4 lettere (camas e cama, hospitales e hospital,
baratas e barato coincidono; ojos e ojo pure).

**Titoli fissi (T-5101).** I modelli di `strategy.templates` valgono per lo spagnolo dal catalogo del paese della
strategia (della sezione del piano se ne ha uno proprio, altrimenti del progetto): es-419 per i paesi d'America Latina
di `LATIN_AMERICA_COUNTRIES`, es-ES per la Spagna e ogni altro paese. Oggi es-419 non ha modelli propri e usa quelli di
es-ES (riga dei modelli nel registro). Le keyword-domanda diventano titoli con «¿» all'inizio e «?» alla fine, mai
raddoppiati; maiuscola solo sulla prima lettera, il resto della keyword com'è.

**Titoli con l'AI (T-5102).** Istruzioni in spagnolo con la variante del paese: «español de España», «español de
México» (nome spagnolo del paese) o «español neutro»; «vosotros» in Spagna, «ustedes» altrove (`docs/AI-TITLES.md`).
