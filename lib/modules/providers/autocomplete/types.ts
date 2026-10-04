export type SuggestionRequest = {
  query: string;
  languageCode: string;
  countryCode: string;
};

export type AutocompleteSuggestion = {
  keyword: string;
  source: string;
  sourceQuery: string;
};

export interface AutocompleteProviderClient {
  readonly id: string;
  suggest(input: SuggestionRequest): Promise<AutocompleteSuggestion[]>;
}

/** Query di autocomplete non riuscita dopo i tentativi ammessi: il chiamante decide, mai un risultato fittizio. */
export class AutocompleteQueryFailedError extends Error {
  constructor(
    readonly query: string,
    readonly status: number | undefined,
    options?: { cause?: unknown }
  ) {
    super(`Autocomplete non riuscito per la query "${query}"${status ? ` (HTTP ${status})` : ""}`, options);
    this.name = "AutocompleteQueryFailedError";
  }
}
