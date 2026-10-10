import type { WorkspaceRole } from "@/lib/generated/prisma/enums";

/** Gerarchia dei ruoli del workspace (D-08): ogni ruolo ha anche i permessi dei ruoli sotto di lui. */
const ROLE_RANK: Record<WorkspaceRole, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

/**
 * Tabella unica dei permessi per workspace (T-1502, D-08): ogni azione con il ruolo minimo che la può compiere. MEMBER
 * legge e modifica progetti e sezioni (eliminazione delle sezioni compresa), avvia estrazioni, genera e modifica le
 * strategie hub and spoke (T-1903) ed esporta; ADMIN in più
 * elimina progetti, gestisce membri e inviti e rinomina il workspace; OWNER in più fatturazione, eliminazione e
 * trasferimento del workspace. Rotte, pagine e test leggono solo questa tabella: cambiare una scelta tocca solo qui.
 */
export const WORKSPACE_PERMISSIONS = {
  "workspace.read": "MEMBER",
  "project.read": "MEMBER",
  "project.create": "MEMBER",
  "project.update": "MEMBER",
  "section.write": "MEMBER",
  "extraction.run": "MEMBER",
  "export.run": "MEMBER",
  "strategy.write": "MEMBER",
  "project.delete": "ADMIN",
  "members.manage": "ADMIN",
  "workspace.update": "ADMIN",
  "billing.manage": "OWNER",
  "workspace.delete": "OWNER",
  "workspace.transfer": "OWNER",
} as const satisfies Record<string, WorkspaceRole>;

export type WorkspaceAction = keyof typeof WORKSPACE_PERMISSIONS;

/** true se il ruolo raggiunge il ruolo minimo dell'azione. */
export function canPerform(role: WorkspaceRole, action: WorkspaceAction): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[WORKSPACE_PERMISSIONS[action]];
}

/** Ruoli che possono compiere l'azione: filtro role in (...) dei where con il perimetro del workspace. */
export function rolesFor(action: WorkspaceAction): WorkspaceRole[] {
  return (Object.keys(ROLE_RANK) as WorkspaceRole[]).filter((role) => canPerform(role, action));
}

/** true se chi ha il ruolo actor può cambiare ruolo o rimuovere chi ha target: un ADMIN non tocca un OWNER. */
export function outranksOrEquals(actor: WorkspaceRole, target: WorkspaceRole): boolean {
  return ROLE_RANK[actor] >= ROLE_RANK[target];
}
