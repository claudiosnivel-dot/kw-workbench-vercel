import { render, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { APP_TIME_ZONE, DEFAULT_LOCALE } from "@/lib/i18n/locale";
import messages from "@/messages/it.json";

/** Provider dei messaggi come nel layout dell'app (T-1301): catalogo italiano, lingua di default. */
function IntlProviders({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale={DEFAULT_LOCALE} messages={messages} timeZone={APP_TIME_ZONE}>
      {children}
    </NextIntlClientProvider>
  );
}

/** render di Testing Library dentro il provider di next-intl; rerender mantiene il provider. */
export function renderWithIntl(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, { wrapper: IntlProviders, ...options });
}
