import { z } from 'zod';

const text = z.string().max(2000);
const coordinate = z.number().finite().nullable();
export const cloudTableSchemas = {
  deliveries: z.object({ id: z.string().uuid(), cliente: text, telefone: text, cep: z.string().refine(v => v === '' || /^\d{5}-\d{3}$/.test(v), 'CEP inválido'), endereco: text, numero: text, bairro: text, cidade: text, complemento: text, observacoes: text, valor: z.number().min(0).max(1000000), data_hora: z.string().datetime(), agendado_para: z.string().datetime().nullable(), lat: z.number().min(-90).max(90).nullable(), lng: z.number().min(-180).max(180).nullable(), status: z.enum(['pendente','em_rota','entregue','cancelada']), pago: z.boolean(), criado_em: z.string().datetime(), track_code: z.string().min(6).max(64).nullable() }).partial().strict(),
  clientes: z.object({ key: text, cliente: text, telefone: text, cep: text, endereco: text, numero: text, bairro: text, cidade: text, complemento: text, lat: coordinate, lng: coordinate }).partial().strict(),
  produtos: z.object({ id: z.string().uuid(), nome: z.string().trim().min(1).max(200), descricao: text, categoria: text, preco: z.number().min(0).max(1000000), imagem_url: text.nullable(), ativo: z.boolean(), ordem: z.number().int(), criado_em: z.string().datetime() }).partial().strict(),
  company_settings: z.object({ id: z.literal('default'), nome: text, saudacao: text, whatsapp_template: text, endereco_origem: text.nullable(), lat_origem: coordinate, lng_origem: coordinate, atualizado_em: z.string().datetime() }).partial().strict(),
  driver_locations: z.object({ id: z.literal('default'), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracy: coordinate, heading: coordinate, speed: coordinate, updated_at: z.string().datetime() }).partial().strict(),
};
export const cloudRequestSchema = z.object({
  table: z.enum(['deliveries','clientes','produtos','company_settings','driver_locations']),
  operation: z.enum(['select','insert','update','delete','upsert']),
  values: z.record(z.string(), z.unknown()).optional(),
  filters: z.array(z.object({ column: z.string(), value: z.union([z.string(),z.boolean(),z.null()]), kind: z.enum(['eq','is']) })).max(3).default([]),
});
export function validateCloudRequest(input: unknown) {
  const request = cloudRequestSchema.parse(input);
  const pk = request.table === 'clientes' ? 'key' : 'id';
  for (const filter of request.filters) {
    if (![pk, ...(request.table === 'produtos' ? ['ativo'] : []), ...(request.table === 'deliveries' ? ['track_code'] : [])].includes(filter.column)) throw new Error('Filtro não permitido');
  }
  if (['update','delete'].includes(request.operation) && !request.filters.some(f => f.column === pk && f.kind === 'eq' && typeof f.value === 'string' && f.value.length > 0)) throw new Error('Informe o registro a alterar');
  if (request.values) request.values = cloudTableSchemas[request.table].parse(request.values);
  if (['insert','update','upsert'].includes(request.operation) && !request.values) throw new Error('Dados obrigatórios');
  return request;
}
export const onlineOrderSchema = z.object({
  id: z.string().uuid(), nome: z.string().trim().min(1).max(100), telefone: z.string().min(10).max(20),
  cep: z.string().max(9), endereco: z.string().max(200), numero: z.string().max(20), bairro: z.string().max(100), complemento: z.string().max(200),
  tipoEntrega: z.enum(['entrega','retirada']), pagamento: z.enum(['Dinheiro','Pix','Cartão na entrega']), troco: z.string().max(40), obs: z.string().max(500),
  cart: z.array(z.object({ id: z.string().uuid(), qtd: z.number().int().min(1).max(100) })).min(1).max(100),
});
export function orderTotal(items: { preco: number; qtd: number }[], type: 'entrega'|'retirada') {
  return (items.reduce((sum,i) => sum + Math.round(i.preco*100)*i.qtd,0) + (type === 'entrega' ? 800 : 0))/100;
}