import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getSupabase } from "../supabase";

export default defineTool({
  name: "list_deliveries",
  title: "Listar entregas",
  description:
    "Lista as entregas cadastradas, opcionalmente filtradas por status. Retorna as mais recentes primeiro.",
  inputSchema: {
    status: z
      .enum(["pendente", "em_rota", "entregue", "cancelada"])
      .optional()
      .describe("Filtra por status da entrega."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("Máximo de entregas a retornar (padrão 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }) => {
    const supabase = getSupabase();
    let query = supabase
      .from("deliveries")
      .select("*")
      .order("criado_em", { ascending: false })
      .limit(limit ?? 50);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) {
      return { content: [{ type: "text", text: `Erro: ${error.message}` }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { deliveries: data ?? [] },
    };
  },
});
