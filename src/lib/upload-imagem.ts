import { supabase } from "@/integrations/supabase/client";

export const PRODUTOS_BUCKET = "produtos";
const MAX_BYTES = 5 * 1024 * 1024;

/** Envia a imagem para o storage e devolve a URL pública. */
export async function uploadProdutoImagem(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecione um arquivo de imagem (JPG, PNG ou WEBP).");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Imagem muito grande — o limite é 5 MB.");
  }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `produtos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || "jpg"}`;

  const { error } = await supabase.storage.from(PRODUTOS_BUCKET).upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type,
  });
  if (error) {
    console.error("[upload] produtos", error);
    const msg = (error as { message?: string }).message || "";
    if (/bucket not found/i.test(msg)) {
      throw new Error(
        'O armazenamento de imagens ainda não foi criado. Rode o SQL de "storage-produtos" no banco para criar o bucket "produtos".',
      );
    }
    if (/row-level security|not authorized|403/i.test(msg)) {
      throw new Error("Sem permissão para enviar imagens. Verifique as políticas do bucket \"produtos\".");
    }
    throw new Error(`Não consegui enviar a imagem: ${msg || "erro desconhecido no storage"}`);
  }

  const { data } = supabase.storage.from(PRODUTOS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
