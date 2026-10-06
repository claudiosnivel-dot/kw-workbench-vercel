/**
 * next-intl/server per i test d'integrazione (T-1302). Fuori dal server di Next il modulo non ha la configurazione
 * della richiesta (i18n/request.ts è collegato dal plugin): qui le stesse API lavorano sul catalogo italiano, la
 * lingua di default (D-07), con il fuso orario dell'app. Registrato da tests/integration/setup.ts.
 */
import { createFormatter, createTranslator } from "next-intl";
import { APP_TIME_ZONE, DEFAULT_LOCALE } from "@/lib/i18n/locale";
import messages from "@/messages/it.json";

type NamespaceArgument = string | { namespace?: string } | undefined;

export async function getLocale() {
  return DEFAULT_LOCALE;
}

export async function getMessages() {
  return messages;
}

export async function getTimeZone() {
  return APP_TIME_ZONE;
}

export async function getTranslations(argument?: NamespaceArgument) {
  const namespace = typeof argument === "string" ? argument : argument?.namespace;
  return createTranslator({ locale: DEFAULT_LOCALE, messages, timeZone: APP_TIME_ZONE, namespace: namespace as never });
}

export async function getFormatter() {
  return createFormatter({ locale: DEFAULT_LOCALE, timeZone: APP_TIME_ZONE });
}
