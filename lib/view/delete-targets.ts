/** Rotta, tipo e nome di DeleteEntityButton per progetti e sezioni (T-1102); i testi vengono dal catalogo (T-1302). */
export function projectDeleteTarget(project: { id: string; name: string }) {
  return { endpoint: `/api/projects/${project.id}`, kind: "project" as const, name: project.name };
}

export function sectionDeleteTarget(projectId: string, section: { id: string; name: string }) {
  return { endpoint: `/api/projects/${projectId}/subprojects/${section.id}`, kind: "section" as const, name: section.name };
}
