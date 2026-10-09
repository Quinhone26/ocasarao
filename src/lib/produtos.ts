import { useCallback, useEffect, useState } from "react";
import { appDatabase } from "@/lib/database-contract";

export interface Produto {
  id: string;
  nome: string;
  descricao: string;
  categoria: string;
  preco: number;
  imagemUrl: string | null;
  ativo: boolean;
  ordem: number;
}

type ProdutoRow = {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  preco: number | string | null;
  imagem_url: string | null;
  ativo: boolean | null;
  ordem: number | null;
};

function fromRow(r: ProdutoRow): Produto {
  return {
    id: r.id,
    nome: r.nome ?? "",
    descricao: r.descricao ?? "",
    categoria: r.categoria || "Geral",
    preco: Number(r.preco) || 0,
    imagemUrl: r.imagem_url,
    ativo: r.ativo ?? true,
    ordem: r.ordem ?? 0,
  };
}

function toRow(p: Partial<Produto>) {
  const r: Partial<ProdutoRow> = {};
  if (p.nome !== undefined) r.nome = p.nome;
  if (p.descricao !== undefined) r.descricao = p.descricao;
  if (p.categoria !== undefined) r.categoria = p.categoria;
  if (p.preco !== undefined) r.preco = p.preco;
  if (p.imagemUrl !== undefined) r.imagem_url = p.imagemUrl;
  if (p.ativo !== undefined) r.ativo = p.ativo;
  if (p.ordem !== undefined) r.ordem = p.ordem;
  return r;
}

/** Lista produtos. `somenteAtivos` para a página pública do cardápio. */
export async function fetchProdutos(somenteAtivos: boolean): Promise<Produto[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    let q = appDatabase().from("produtos").select("*").order("ordem").order("nome");
    if (somenteAtivos) q = q.eq("ativo", true);
    const { data, error } = await q.abortSignal(controller.signal);
    if (error) throw error;
    return ((data ?? []) as ProdutoRow[]).map(fromRow);
  } finally {
    clearTimeout(timeout);
  }
}

function produtosErrorMessage(error: unknown): string {
  const e = error && typeof error === "object" ? error as { code?: string; message?: string } : {};
  if (e.code === "42P01" || e.code === "PGRST205") {
    return "O cardápio ainda não foi configurado. Entre em contato com o responsável pela loja.";
  }
  if (e.code === "42501" || /permission denied|row-level security/i.test(e.message ?? "")) {
    return "Não foi possível acessar os produtos. O responsável pela loja precisa verificar as permissões de acesso.";
  }
  if (/fetch|network|abort|timeout|connection/i.test(e.message ?? "")) {
    return "Não foi possível conectar ao cardápio. Verifique sua internet e tente novamente. Se continuar, avise o responsável pela loja.";
  }
  return "Não foi possível carregar os produtos agora. Tente novamente.";
}

export function useProdutos(somenteAtivos = false) {
  const [items, setItems] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchProdutos(somenteAtivos));
      setError(null);
    } catch (e) {
      console.warn("[produtos] load:", e);
      setError(produtosErrorMessage(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [somenteAtivos]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(
    async (p: Omit<Produto, "id">) => {
      const { error: e } = await appDatabase().from("produtos").insert(toRow(p));
      if (e) throw new Error(e.message);
      await refresh();
    },
    [refresh],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Produto>) => {
      const { error: e } = await appDatabase().from("produtos").update(toRow(patch)).eq("id", id);
      if (e) throw new Error(e.message);
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      const { error: e } = await appDatabase().from("produtos").delete().eq("id", id);
      if (e) throw new Error(e.message);
      await refresh();
    },
    [refresh],
  );

  return { items, loading, error, refresh, create, update, remove };
}

export type CartItem = { produto: Produto; qtd: number };

export function cartTotal(cart: CartItem[]): number {
  return cart.reduce((s, i) => s + i.produto.preco * i.qtd, 0);
}

export function cartToText(cart: CartItem[]): string {
  return cart
    .map((i) => `${i.qtd}x ${i.produto.nome} (${(i.produto.preco * i.qtd).toFixed(2)})`)
    .join(" | ");
}
