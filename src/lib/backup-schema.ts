import { z } from 'zod';

const text = z.string().max(5000);
const optionalText = text.nullable();
export const customerBackupSchema = z.object({
  key: z.string().min(1).max(500), cliente: z.string().min(1).max(500),
  telefone: optionalText, cep: optionalText, endereco: optionalText, numero: optionalText,
  bairro: optionalText, cidade: optionalText, complemento: optionalText,
  lat: z.number().min(-90).max(90).nullable(), lng: z.number().min(-180).max(180).nullable(),
});
export const productBackupSchema = z.object({
  id: z.uuid(), nome: z.string().min(1).max(500), descricao: optionalText,
  categoria: optionalText, preco: z.coerce.number().finite().nonnegative(),
  imagem_url: z.string().regex(/^\/api\/public\/product-image\?path=produtos%2F[a-f0-9-]{36}$/).nullable(),
  ativo: z.boolean(), ordem: z.number().int(),
});
export const backupSchema = z.object({
  format: z.literal('ocasarao-backup'), version: z.literal(1), createdAt: z.iso.datetime(),
  clientes: z.array(customerBackupSchema).max(10000), produtos: z.array(productBackupSchema).max(10000),
}).superRefine((data, ctx) => {
  for (const [name, keys] of [['clientes', data.clientes.map(c => c.key)], ['produtos', data.produtos.map(p => p.id)]] as const) {
    if (new Set(keys).size !== keys.length) ctx.addIssue({code:'custom',message:'Registros duplicados no backup.',path:[name]});
  }
});
export type Backup = z.infer<typeof backupSchema>;

export function imagePath(url: string | null) {
  if (!url) return null;
  const match = /^\/api\/public\/product-image\?path=(produtos%2F[a-f0-9-]{36})$/.exec(url);
  if (!match) throw new Error('Uma foto usa um endereço antigo. Atualize a foto antes de baixar o backup.');
  return decodeURIComponent(match[1]);
}