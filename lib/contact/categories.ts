/** Categorie del modulo contatti (T-1805): elenco chiuso, l'unico valore dell'utente che entra nell'oggetto dell'email. */
export const CONTACT_CATEGORIES = ["support", "billing", "privacy", "other"] as const;
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];
