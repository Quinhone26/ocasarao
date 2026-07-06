import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getSupabase } from "../supabase";

export default defineTool({
  name: "update_delivery_status",
  title: "Atualizar status da entrega",
  description:
    "Altera o status de uma entrega (pendente, em_rota, entregue, cancelada).",
  inputSchema: {
    id: z.string().uuid().describe("ID da entrega."),
    status: z
      .enum(["pendente", "em_rota", "entregue", "cancelada"])
      .describe("Novo status."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, status }) => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("deliveries")
      .update({ status })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      return { content: [{ type: "text", text: `Erro: ${error.message}` }], isError: true };
    }
    return {
      content: [{ type: "text", text: `Status atualizado para ${status}.` }],
      structuredContent: { delivery: data },
    };
  },
});
