import { AutocompleteProviderClient, AutocompleteSuggestion, SuggestionRequest } from "@/lib/modules/providers/autocomplete/types";

export class MockAutocompleteProvider implements AutocompleteProviderClient {
  async suggest(input: SuggestionRequest): Promise<AutocompleteSuggestion[]> {
    const base = input.query.trim();
    if (!base) {
      return [];
    }

    const suffixes = [
      "for beginners",
      "best tools",
      "near me",
      "examples",
      "template",
      "comparison",
      "how to",
    ];

    return suffixes.map((suffix) => ({
      keyword: `${base} ${suffix}`,
      source: "mock-autocomplete",
      sourceQuery: input.query,
    }));
  }
}
