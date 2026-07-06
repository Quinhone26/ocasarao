import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getSupabase } from "../supabase";

export default defineTool({
  name: "get_delivery",
  title: "Buscar entrega",
  description: "Retorna todos os dados de uma entrega pelo seu ID.",
  inputSchema: {
    id: z.string().uuid().describe("ID (UUID) da entrega."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }) => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("deliveries")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      return { content: [{ type: "text", text: `Erro: ${error.message}` }], isError: true };
    }
    if (!data) {
      return { content: [{ type: "text", text: "Entrega não encontrada." }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { delivery: data },
    };
  },
});
