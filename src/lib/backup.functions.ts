import { createServerFn } from '@tanstack/react-start';
import { useSession, setResponseHeader } from '@tanstack/react-start/server';
import { gateSessionConfig, type GateSession } from './gate.server';
import { backupSchema, imagePath } from './backup-schema';

async function authorizedDatabase() {
  const session = await useSession<GateSession>(gateSessionConfig());
  if (session.data.unlocked !== true) throw new Error('Entre com a senha da loja para acessar o backup.');
  setResponseHeader('Cache-Control', 'private, no-store');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin;
}

export const exportBackup = createServerFn({method:'POST'}).handler(async () => {
  const db = await authorizedDatabase();
  async function readAll(table: 'clientes' | 'produtos', key: string) {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 1000) {
      const {data, error} = await db.from(table).select('*').order(key).range(offset, offset + 999).abortSignal(AbortSignal.timeout(15000));
      if (error) throw new Error('Não foi possível ler os dados. Nenhum backup foi gerado.');
      rows.push(...(data ?? []));
      if (rows.length > 10000) throw new Error('Este cadastro precisa de uma exportação assistida pelo responsável.');
      if (!data || data.length < 1000) return rows;
    }
  }
  const [clientes, produtos] = await Promise.all([readAll('clientes', 'key'), readAll('produtos', 'id')]);
  for (const p of produtos) imagePath(p.imagem_url as string | null);
  const backup = backupSchema.parse({format:'ocasarao-backup',version:1,createdAt:new Date().toISOString(),clientes,produtos});
  const paths = [...new Set(backup.produtos.map(p => imagePath(p.imagem_url)).filter((p): p is string => p !== null))];
  const photos: {path:string; url:string}[] = [];
  for (let offset = 0; offset < paths.length; offset += 100) {
    const {data, error} = await db.storage.from('produtos').createSignedUrls(paths.slice(offset,offset+100), 600);
    if (error || !data) throw new Error('Não foi possível incluir as fotos no backup.');
    for (const item of data) {
      if (item.error || !item.path || !item.signedUrl) throw new Error('Uma foto não foi encontrada. Atualize a foto e tente novamente.');
      photos.push({path:item.path,url:item.signedUrl});
    }
  }
  return {backup,photos};
});

export const restoreBackup = createServerFn({method:'POST'})
  .inputValidator(backupSchema)
  .handler(async ({data}) => {
    const db = await authorizedDatabase();
    const paths = [...new Set(data.produtos.map(p => imagePath(p.imagem_url)).filter((p): p is string => p !== null))];
    for (const path of paths) {
      const {error} = await db.storage.from('produtos').download(path);
      if (error) throw new Error('Uma foto não foi enviada. Nenhum cadastro foi restaurado.');
    }
    // Add missing primary keys only: retries are safe and never overwrite current registrations.
    let clients = 0, products = 0;
    for (let offset = 0; offset < data.clientes.length; offset += 250) {
      const {data: saved,error} = await db.from('clientes').upsert(data.clientes.slice(offset,offset+250),{onConflict:'key',ignoreDuplicates:true}).select('key');
      if (error) throw new Error('A restauração foi interrompida. Tente novamente; os cadastros já salvos serão preservados.');
      clients += saved?.length ?? 0;
    }
    for (let offset = 0; offset < data.produtos.length; offset += 250) {
      const {data:saved,error} = await db.from('produtos').upsert(data.produtos.slice(offset,offset+250),{onConflict:'id',ignoreDuplicates:true}).select('id');
      if (error) throw new Error('A restauração foi interrompida. Tente novamente; os cadastros já salvos serão preservados.');
      products += saved?.length ?? 0;
    }
    return {clients,products};
  });