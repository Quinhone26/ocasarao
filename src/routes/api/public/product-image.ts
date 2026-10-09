import { createFileRoute } from '@tanstack/react-router';
import { useSession } from '@tanstack/react-start/server';
import { gateSessionConfig, type GateSession } from '@/lib/gate.server';

export const Route = createFileRoute('/api/public/product-image')({
  server:{handlers:{GET:async({request})=>{
    const path = new URL(request.url).searchParams.get('path');
    if (!path || !/^produtos\/[a-f0-9-]{36}$/.test(path)) return new Response('Imagem inválida',{status:400});
    const {supabaseAdmin} = await import('@/integrations/supabase/client.server');
    // Serve only objects referenced by published menu items, never arbitrary private files.
    const {data:products,error} = await supabaseAdmin.from('produtos').select('id').eq('ativo',true).eq('imagem_url',`/api/public/product-image?path=${encodeURIComponent(path)}`).limit(1);
    let administrator = false;
    if (!products?.length) {
      const session = await useSession<GateSession>(gateSessionConfig());
      administrator = session.data.unlocked === true;
    }
    if (error || (!products?.length && !administrator)) return new Response('Imagem não encontrada',{status:404});
    const {data,error:downloadError} = await supabaseAdmin.storage.from('produtos').download(path);
    if (downloadError || !data) return new Response('Imagem indisponível',{status:404});
    return new Response(data,{headers:{'Content-Type':data.type,'Cache-Control':administrator?'private, no-store':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
  }}},
});