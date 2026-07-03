import { describe, it, expect, beforeEach, vi } from "vitest";
import { lookupCep } from "./cep";

function mockFetchOnce(impl: () => Promise<Response> | Response) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

describe("lookupCep", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("retorna invalid quando o CEP não tem 8 dígitos", async () => {
    const r = await lookupCep("123");
    expect(r.status).toBe("invalid");
  });

  it("retorna ok e cacheia quando o CEP é válido", async () => {
    mockFetchOnce(
      () =>
        new Response(
          JSON.stringify({
            cep: "01001-000",
            logradouro: "Praça da Sé",
            bairro: "Sé",
            localidade: "São Paulo",
            uf: "SP",
          }),
          { status: 200 },
        ),
    );
    const r = await lookupCep("01001-000");
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.data.logradouro).toBe("Praça da Sé");
      expect(r.fromCache).toBeFalsy();
    }

    // segunda chamada vem do cache — não chama fetch de novo
    const fetchSpy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const r2 = await lookupCep("01001000");
    expect(r2.status).toBe("ok");
    if (r2.status === "ok") expect(r2.fromCache).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retorna not_found quando a API responde com { erro: true }", async () => {
    mockFetchOnce(() => new Response(JSON.stringify({ erro: true }), { status: 200 }));
    const r = await lookupCep("00000000");
    expect(r.status).toBe("not_found");
  });

  it("retorna network_error quando o fetch falha", async () => {
    mockFetchOnce(() => Promise.reject(new TypeError("failed to fetch")));
    const r = await lookupCep("12345678");
    expect(r.status).toBe("network_error");
  });

  it("retorna network_error quando a resposta HTTP não é ok", async () => {
    mockFetchOnce(() => new Response("boom", { status: 500 }));
    const r = await lookupCep("12345678");
    expect(r.status).toBe("network_error");
  });
});
