import type { AppLocale } from "@/lib/i18n/locale";
import type messages from "@/messages/it.json";

// Chiavi e argomenti dei messaggi tipizzati dal catalogo italiano (T-1301): una chiave inesistente non compila.
declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof messages;
  }
}
