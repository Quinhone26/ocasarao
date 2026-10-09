import { createServerFn } from '@tanstack/react-start';
import { useSession } from '@tanstack/react-start/server';
import { gateSessionConfig, type GateSession } from './gate.server';
import { validateCloudRequest, onlineOrderSchema, orderTotal } from './cloud-validation';
import { isValidCep, isAllowedCity, lookupCep, formatCep } from './cep';
import { normalizeBrPhone } from './masks';

export const cloudQuery = createServerFn({ method: 'POST' })
  .inputValidator(validateCloudRequest)
  .handler(async ({ data }) => {
    const session = await useSession<GateSession>(gateSessionConfig());
    if (session.data.unlocked !== true) throw new Error('Entre com a senha da loja para acessar estes dados.');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin.from(data.table);
    let query = data.operation === 'select' ? db.select('*') : data.operation === 'delete' ? db.delete() : data.operation === 'insert' ? db.insert(data.values as never) : data.operation === 'upsert' ? db.upsert(data.values as never) : db.update(data.values as never);
    for (const f of data.filters) query = f.kind === 'eq' && f.value !== null ? query.eq(f.column,f.value) : query.is(f.column,null);
    if (data.operation === 'select') {
      const rows: Record<string, string | number | boolean | null>[] = [];
      const pk = data.table === 'clientes' ? 'key' : 'id';
      for (let offset=0; ; offset+=1000) {
        const { data: batch, error } = await query.order(pk).range(offset,offset+999).abortSignal(AbortSignal.timeout(15000));
        if (error) return { data: null, error: { message:error.message, code:error.code } };
        rows.push(...(batch ?? []) as Record<string, string | number | boolean | null>[]);
        if (!batch || batch.length < 1000) break;
      }
      return { data: rows, error: null };
    }
    const { error } = await query.abortSignal(AbortSignal.timeout(15000));
    return { data: null, error: error ? {message:error.message,code:error.code} : null };
  });

export const submitOnlineOrder = createServerFn({ method: 'POST' })
  .inputValidator(onlineOrderSchema)
  .handler(async ({ data }) => {
    const phone = normalizeBrPhone(data.telefone);
    if (!phone) throw new Error('Informe um WhatsApp válido com DDD.');
    const delivery = data.tipoEntrega === 'entrega';
    if (delivery) {
      if (!isValidCep(data.cep) || !data.endereco.trim()) throw new Error('Informe CEP e endereço válidos.');
      const cep = await lookupCep(data.cep, AbortSignal.timeout(10000));
      if (cep.status !== 'ok') throw new Error('Não foi possível validar o CEP. Tente novamente.');
      if (!isAllowedCity(cep.data.localidade,cep.data.uf)) throw new Error('Entregamos somente em Umuarama-PR.');
    }
    // This narrowly validated public capability cannot select or modify customer records.
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: products,error } = await supabaseAdmin.from('produtos').select('id,nome,preco').eq('ativo',true).in('id',data.cart.map(i=>i.id));
    if (error) throw new Error('Não foi possível consultar os preços.');
    const items = data.cart.map(i=>{
      const p = products?.find(p=>p.id===i.id);
      if (!p) throw new Error('Um produto não está mais disponível. Atualize o cardápio.');
      return {nome:p.nome,preco:Number(p.preco),qtd:i.qtd};
    });
    const total = orderTotal(items,data.tipoEntrega);
    if (total<=0) throw new Error('Valor do pedido inválido.');
    const {data: existing} = await supabaseAdmin.from('deliveries').select('track_code,telefone,valor').eq('id',data.id).maybeSingle();
    if (existing) {
      if (existing.telefone!==phone) throw new Error('Identificador de pedido inválido.');
      return {track:existing.track_code,total:Number(existing.valor)};
    }
    const now = new Date().toISOString();
    const track = crypto.randomUUID().replaceAll('-','').slice(0,24);
    const address = delivery ? data.endereco.trim() : 'RETIRADA NO LOCAL';
    const customer = {key:`p:${phone.replace(/\D/g,'')}`,cliente:data.nome,telefone:phone,cep:delivery?formatCep(data.cep):'',endereco:delivery?address:'',numero:delivery?data.numero:'',bairro:delivery?data.bairro:'',cidade:delivery?'Umuarama':'',complemento:delivery?data.complemento:'',lat:null,lng:null};
    const row = {id:data.id,cliente:data.nome,telefone:phone,cep:customer.cep,endereco:address,numero:customer.numero,bairro:customer.bairro,cidade:'Umuarama',complemento:customer.complemento,observacoes:`PEDIDO ONLINE: ${items.map(i=>`${i.qtd}x ${i.nome} (${(i.preco*i.qtd).toFixed(2)})`).join(' | ')} · ${delivery?'Entrega (taxa R$ 8,00)':'RETIRADA NO LOCAL'} · Pagamento: ${data.pagamento}${data.troco?` (troco para ${data.troco})`:''}${data.obs?` · Obs: ${data.obs}`:''}`,valor:total,data_hora:now,agendado_para:null,lat:null,lng:null,status:'pendente',pago:false,criado_em:now,track_code:track};
    const {error:saveError} = await supabaseAdmin.rpc('save_online_order',{_delivery:row,_customer:customer});
    if (saveError) throw new Error('Não consegui salvar o pedido. Tente novamente.');
    return {track,total};
  });

export const imageUploadToken = createServerFn({method:'POST'})
  .inputValidator((input:{type:string})=> {
    if (!['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(input.type)) throw new Error('Formato de imagem inválido.');
    return input;
  })
  .handler(async()=>{
    const session = await useSession<GateSession>(gateSessionConfig());
    if (session.data.unlocked!==true) throw new Error('Entre com a senha da loja.');
    const {supabaseAdmin} = await import('@/integrations/supabase/client.server');
    const path = `produtos/${crypto.randomUUID()}`;
    const {data,error} = await supabaseAdmin.storage.from('produtos').createSignedUploadUrl(path);
    if (error || !data) throw new Error('Não consegui autorizar o envio da imagem.');
    return {path,token:data.token};
  });