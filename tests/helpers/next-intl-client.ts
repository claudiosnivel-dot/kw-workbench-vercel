/**
 * Hook client di next-intl per i test d'integrazione (T-1302). Le pagine si rendono con renderToStaticMarkup fuori
 * da Next: il NextIntlClientProvider del layout non riceve la configurazione della richiesta e le pagine rese da
 * sole non hanno provider. Qui gli hook usano il catalogo italiano, come tests/helpers/next-intl-server.ts.
 */
import type { ReactNode } from "react";
import { APP_TIME_ZONE, DEFAULT_LOCALE } from "@/lib/i18n/locale";
import messages from "@/messages/it.json";

type NextIntlModule = typeof import("next-intl");

export function withItalianCatalog(actual: NextIntlModule) {
  return {
    ...actual,
    NextIntlClientProvider: ({ children }: { children: ReactNode }) => children,
    useLocale: () => DEFAULT_LOCALE,
    useTimeZone: () => APP_TIME_ZONE,
    useMessages: () => messages,
    useTranslations: (namespace?: string) =>
      actual.createTranslator({ locale: DEFAULT_LOCALE, messages, timeZone: APP_TIME_ZONE, namespace: namespace as never }),
    useFormatter: () => actual.createFormatter({ locale: DEFAULT_LOCALE, timeZone: APP_TIME_ZONE }),
  };
}
