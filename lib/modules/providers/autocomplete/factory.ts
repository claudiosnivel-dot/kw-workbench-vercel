import { AutocompleteProvider } from "@prisma/client";
import { GoogleDirectAutocompleteProvider } from "@/lib/modules/providers/autocomplete/google-direct";
import { MockAutocompleteProvider } from "@/lib/modules/providers/autocomplete/mock";
import { AutocompleteProviderClient } from "@/lib/modules/providers/autocomplete/types";

export function createAutocompleteProvider(provider: AutocompleteProvider): AutocompleteProviderClient {
  if (provider === "GOOGLE_DIRECT") {
    return new GoogleDirectAutocompleteProvider();
  }

  return new MockAutocompleteProvider();
}
