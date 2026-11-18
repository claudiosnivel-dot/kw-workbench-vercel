import { z } from "zod";
import type { AuthUser } from "@/lib/auth/credentials";
import { AppError } from "@/lib/http/errors";

/**
 * Contesto di una chiamata di strumento del server MCP (T-7201): l'utente della chiave e recordProject, che lo strumento
 * chiama dopo il controllo d'accesso per scrivere il progetto nella riga di agent_calls.
 */
export type AgentToolContext = { user: AuthUser; recordProject(projectId: string): void };

/** Strumento registrato (T-7201): nome, descrizione in inglese per il modello, JSON Schema dell'input e chiamata. */
export type AgentTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call(args: unknown, context: AgentToolContext): Promise<unknown>;
};

/**
 * Strumento con l'input validato da zod: il JSON Schema di tools/list viene dallo stesso schema, così i due non si
 * separano. Un input non valido è un AppError VALIDATION_ERROR con il campo sbagliato, che il server restituisce come
 * risultato con isError (il modello può correggersi).
 */
export function defineTool<S extends z.ZodType>(spec: {
  name: string;
  description: string;
  input: S;
  run(input: z.output<S>, context: AgentToolContext): Promise<unknown>;
}): AgentTool {
  const inputSchema = Object.fromEntries(Object.entries(z.toJSONSchema(spec.input)).filter(([key]) => key !== "$schema"));
  return {
    name: spec.name,
    description: spec.description,
    inputSchema,
    async call(args, context) {
      const parsed = spec.input.safeParse(args);
      if (!parsed.success) {
        const field = parsed.error.issues[0].path.join(".");
        throw new AppError(400, "VALIDATION_ERROR", "Input dello strumento non valido", field ? { field } : undefined);
      }
      return spec.run(parsed.data, context);
    },
  };
}
