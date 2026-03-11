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
