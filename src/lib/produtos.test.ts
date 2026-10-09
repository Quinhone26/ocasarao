import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const query = vi.hoisted(() => ({
  select: vi.fn(), order: vi.fn(), eq: vi.fn(), abortSignal: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { schema: vi.fn(() => ({ from: vi.fn(() => query) })) },
}));

import { fetchProdutos, useProdutos } from "./produtos";

const row = { id: "produto-1", nome: "Produto", preco: "12.50", ativo: true };

beforeEach(() => {
  vi.clearAllMocks();
  query.select.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.abortSignal.mockResolvedValue({ data: [row], error: null });
});

describe("consulta de produtos", () => {
  it("consulta somente produtos ativos no pedido público", async () => {
    await fetchProdutos(true);
    expect(query.eq).toHaveBeenCalledWith("ativo", true);
  });

  it("inclui produtos inativos na consulta administrativa", async () => {
    await fetchProdutos(false);
    expect(query.eq).not.toHaveBeenCalled();
  });

  it("não disfarça falha de consulta como cardápio vazio", async () => {
    query.abortSignal.mockResolvedValue({ data: null, error: { code: "PGRST205" } });
    await expect(fetchProdutos(true)).rejects.toEqual({ code: "PGRST205" });
  });

  it("encerra carregamento após falha e recupera produtos ao tentar novamente", async () => {
    query.abortSignal.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useProdutos(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();
    await act(() => result.current.refresh());
    expect(result.current.error).toBeNull();
    expect(result.current.items).toEqual([expect.objectContaining({ id: "produto-1", preco: 12.5 })]);
  });
});