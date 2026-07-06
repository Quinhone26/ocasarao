import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getSupabase } from "../supabase";

export default defineTool({
  name: "delete_delivery",
  title: "Excluir entrega",
  description: "Remove uma entrega do sistema. Ação irreversível.",
  inputSchema: {
    id: z.string().uuid().describe("ID da entrega a excluir."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async ({ id }) => {
    const supabase = getSupabase();
    const { error } = await supabase.from("deliveries").delete().eq("id", id);
    if (error) {
      return { content: [{ type: "text", text: `Erro: ${error.message}` }], isError: true };
    }
    return { content: [{ type: "text", text: `Entrega ${id} excluída.` }] };
  },
});
