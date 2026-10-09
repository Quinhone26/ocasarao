import { useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { Download, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { backupSchema, imagePath, type Backup } from '@/lib/backup-schema';
import { exportBackup, restoreBackup } from '@/lib/backup.functions';
import { imageUploadToken } from '@/lib/cloud.functions';
import { supabase } from '@/integrations/supabase/client';

function photoType(bytes: Uint8Array) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes[0] === 137 && strFromU8(bytes.slice(1,4)) === 'PNG') return 'image/png';
  if (strFromU8(bytes.slice(0,3)) === 'GIF') return 'image/gif';
  if (strFromU8(bytes.slice(0,4)) === 'RIFF' && strFromU8(bytes.slice(8,12)) === 'WEBP') return 'image/webp';
  if (strFromU8(bytes.slice(4,12)) === 'ftypavif') return 'image/avif';
  throw new Error('O backup contém uma foto inválida.');
}

export function BackupControls() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [pending, setPending] = useState<{backup:Backup; files:Record<string,Uint8Array>} | null>(null);
  const exportFn = useServerFn(exportBackup);
  const restoreFn = useServerFn(restoreBackup);
  const uploadTokenFn = useServerFn(imageUploadToken);

  async function download() {
    setBusy(true); setProgress('Preparando backup…');
    try {
      const {backup,photos} = await exportFn();
      const files: Record<string, Uint8Array> = {'backup.json':strToU8(JSON.stringify(backup))};
      let size = files['backup.json'].length;
      for (const [index, photo] of photos.entries()) {
        setProgress(`Salvando foto ${index+1} de ${photos.length}…`);
        const response = await fetch(photo.url, {signal:AbortSignal.timeout(30000)});
        if (!response.ok) throw new Error('Não foi possível baixar uma foto. Tente novamente.');
        const bytes = new Uint8Array(await response.arrayBuffer());
        photoType(bytes);
        size += bytes.length;
        if (size > 100 * 1024 * 1024) throw new Error('As fotos excedem o tamanho suportado por este backup.');
        files[`fotos/${photo.path}`] = bytes;
      }
      const zip = zipSync(files,{level:0});
      const url = URL.createObjectURL(new Blob([zip.slice().buffer],{type:'application/zip'}));
      const link = document.createElement('a'); link.href = url; link.download = `casarao-backup-${new Date().toISOString().slice(0,10)}.zip`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url),60000);
      toast.success('Backup baixado', {description:`${backup.clientes.length} clientes e ${backup.produtos.length} produtos. Guarde o arquivo em local seguro.`});
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível baixar o backup.'); }
    finally {setBusy(false);setProgress('');}
  }

  async function selectFile(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 105 * 1024 * 1024) throw new Error('O arquivo de backup é muito grande.');
      let expanded = 0;
      const files = unzipSync(new Uint8Array(await file.arrayBuffer()),{filter: entry => {
        expanded += entry.originalSize;
        if (expanded > 105 * 1024 * 1024 || entry.originalSize > (entry.name === 'backup.json' ? 20 : 5) * 1024 * 1024) throw new Error('O arquivo de backup é muito grande.');
        return entry.name === 'backup.json' || /^fotos\/produtos\/[a-f0-9-]{36}$/.test(entry.name);
      }});
      if (!files['backup.json']) throw new Error('Selecione um backup gerado pelo O Casarão.');
      const backup = backupSchema.parse(JSON.parse(strFromU8(files['backup.json'])));
      for (const product of backup.produtos) {
        const path = imagePath(product.imagem_url);
        if (path) {
          const bytes = files[`fotos/${path}`];
          if (!bytes) throw new Error('Uma foto está faltando no backup.');
          photoType(bytes);
        }
      }
      setPending({backup,files});
    } catch {toast.error('Backup inválido ou incompleto. Selecione o arquivo ZIP baixado pelo aplicativo.');}
    finally {setBusy(false);if (input.current) input.current.value = '';}
  }

  async function restore() {
    if (!pending) return;
    const selected = pending; setPending(null); setBusy(true);
    try {
      const backup = structuredClone(selected.backup);
      const remapped = new Map<string,string>();
      for (const product of backup.produtos) {
        const path = imagePath(product.imagem_url);
        if (!path) continue;
        let replacement = remapped.get(path);
        if (!replacement) {
          setProgress(`Restaurando foto de ${product.nome}…`);
          const bytes = selected.files[`fotos/${path}`];
          const type = photoType(bytes);
          const target = await uploadTokenFn({data:{type}});
          const {error} = await supabase.storage.from('produtos').uploadToSignedUrl(target.path,target.token,new Blob([bytes.slice().buffer],{type}),{contentType:type});
          if (error) throw new Error('Não foi possível restaurar uma foto. Tente novamente.');
          replacement = `/api/public/product-image?path=${encodeURIComponent(target.path)}`;
          remapped.set(path,replacement);
        }
        product.imagem_url = replacement;
      }
      setProgress('Restaurando cadastros…');
      const result = await restoreFn({data:backup});
      toast.success('Backup restaurado', {description:`${result.clients} clientes e ${result.products} produtos adicionados. Cadastros existentes foram preservados.`});
    } catch (e) {toast.error(e instanceof Error ? e.message : 'Não foi possível restaurar o backup.');}
    finally {setBusy(false);setProgress('');}
  }

  return <section className="border-t border-border pt-4 space-y-3">
    <h3 className="text-sm font-semibold">Backup de clientes e produtos</h3>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" disabled={busy} onClick={download}><Download className="size-4"/>Baixar backup</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}><Upload className="size-4"/>Restaurar backup</Button>
    </div>
    <input ref={input} type="file" accept=".zip,application/zip" aria-label="Arquivo de backup" className="hidden" onChange={e => selectFile(e.target.files?.[0])}/>
    {busy && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin"/>{progress || 'Verificando arquivo…'}</p>}
    <AlertDialog open={!!pending} onOpenChange={open => {if (!open) setPending(null);}}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Restaurar backup?</AlertDialogTitle><AlertDialogDescription>
        {pending?.backup.clientes.length} clientes e {pending?.backup.produtos.length} produtos no arquivo. Serão adicionados somente os cadastros que faltam; os existentes não serão alterados. As fotos estão incluídas. O histórico de pedidos não faz parte deste backup.
      </AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={restore}>Confirmar restauração</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </section>;
}