/** Rotta e testi di DeleteEntityButton per progetti e sezioni (T-1102). */
export function projectDeleteTarget(project: { id: string; name: string }) {
  return {
    endpoint: `/api/projects/${project.id}`,
    confirmMessage: `Eliminare il progetto "${project.name}"? Verranno rimossi in modo permanente progetto, seed, keyword candidate e job.`,
    failureMessage: "Eliminazione non riuscita",
  };
}

export function sectionDeleteTarget(projectId: string, section: { id: string; name: string }) {
  return {
    endpoint: `/api/projects/${projectId}/subprojects/${section.id}`,
    confirmMessage: `Eliminare la sezione "${section.name}"? Verranno rimossi seed, keyword e job collegati.`,
    failureMessage: "Eliminazione sezione non riuscita",
  };
}
