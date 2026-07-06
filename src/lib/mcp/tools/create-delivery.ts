import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getSupabase } from "../supabase";

export default defineTool({
  name: "create_delivery",
  title: "Criar entrega",
  description:
    "Cria uma nova entrega no sistema. Campos mínimos: cliente e endereço. Retorna a entrega criada.",
  inputSchema: {
    cliente: z.string().min(1).describe("Nome do cliente."),
    endereco: z.string().min(1).describe("Rua/logradouro."),
    numero: z.string().optional().describe("Número do imóvel."),
    bairro: z.string().optional(),
    cidade: z.string().optional().describe("Padrão: Umuarama."),
    cep: z.string().optional().describe("CEP no formato 00000-000."),
    telefone: z.string().optional(),
    complemento: z.string().optional(),
    observacoes: z.string().optional(),
    valor: z.number().min(0).optional().describe("Valor da entrega em R$."),
    agendadoPara: z
      .string()
      .optional()
      .describe("Data/hora ISO 8601 para entrega agendada."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input) => {
    const supabase = getSupabase();
    const row = {
      id: crypto.randomUUID(),
      cliente: input.cliente,
      telefone: input.telefone ?? "",
      cep: input.cep ?? "",
      endereco: input.endereco,
      numero: input.numero ?? "",
      bairro: input.bairro ?? "",
      cidade: input.cidade ?? "Umuarama",
      complemento: input.complemento ?? "",
      observacoes: input.observacoes ?? "",
      valor: input.valor ?? 0,
      data_hora: new Date().toISOString(),
      agendado_para: input.agendadoPara ?? null,
      lat: null,
      lng: null,
      status: "pendente" as const,
    };
    const { data, error } = await supabase
      .from("deliveries")
      .insert(row)
      .select()
      .single();
    if (error) {
      return { content: [{ type: "text", text: `Erro ao criar: ${error.message}` }], isError: true };
    }
    return {
      content: [{ type: "text", text: `Entrega criada: ${data.id}` }],
      structuredContent: { delivery: data },
    };
  },
});
