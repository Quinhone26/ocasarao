import { describe, it, expect } from 'vitest';
import { backupSchema, imagePath } from './backup-schema';
const customer = {key:'p:5544997609919',cliente:'Cliente teste',telefone:'5544997609919',cep:'87511130',endereco:'Rua Tamio Kondo',numero:'10',bairro:'Centro',cidade:'Umuarama',complemento:'',lat:null,lng:null};
const product = {id:'11111111-1111-4111-8111-111111111111',nome:'Produto teste',descricao:'',categoria:'Geral',preco:12.5,imagem_url:null,ativo:false,ordem:1};
const backup = {format:'ocasarao-backup',version:1,createdAt:'2026-10-09T12:00:00.000Z',clientes:[customer],produtos:[product]};
describe('Backup', () => {
  it('preserva endereço do cliente e preço de produto inativo', () => {
    const data = backupSchema.parse(backup);
    expect(data.clientes[0].endereco).toBe('Rua Tamio Kondo');
    expect(data.produtos[0].preco).toBe(12.5);
    expect(data.produtos[0].ativo).toBe(false);
  });
  it('rejeita formato não reconhecido', () => expect(backupSchema.safeParse({...backup,version:2}).success).toBe(false));
  it('rejeita clientes duplicados', () => expect(backupSchema.safeParse({...backup,clientes:[customer,customer]}).success).toBe(false));
  it('rejeita referências externas de fotos', () => expect(backupSchema.safeParse({...backup,produtos:[{...product,imagem_url:'https://example.com/private'}]}).success).toBe(false));
  it('reconhece somente fotos do armazenamento de produtos', () => {
    expect(imagePath('/api/public/product-image?path=produtos%2F11111111-1111-4111-8111-111111111111')).toBe('produtos/11111111-1111-4111-8111-111111111111');
    expect(() => imagePath('https://example.com/private')).toThrow();
  });
});