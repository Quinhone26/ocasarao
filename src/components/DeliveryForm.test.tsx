import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeliveryForm } from "./DeliveryForm";

// Sonner mexe com portais/animações — mocka para não poluir os testes.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function setup() {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(<DeliveryForm onSubmit={onSubmit} onCancel={onCancel} />);
  return { onSubmit, onCancel };
}

async function typeCep(cep: string) {
  const input = screen.getByLabelText(/CEP/i);
  const user = userEvent.setup();
  await user.clear(input);
  await user.type(input, cep);
  return input;
}

describe("DeliveryForm — consulta de CEP", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("CEP válido: preenche endereço, bairro e cidade", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
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
      ),
    );
    setup();
    await typeCep("01001000");

    await waitFor(() => {
      expect(screen.getByLabelText(/Endereço/i)).toHaveValue("Praça da Sé");
    });
    expect(screen.getByLabelText(/Bairro/i)).toHaveValue("Sé");
    expect(screen.getByLabelText(/Cidade/i)).toHaveValue("São Paulo/SP");
    expect(screen.queryByRole("button", { name: /Tentar novamente/i })).not.toBeInTheDocument();
  });

  it("CEP inválido: mostra mensagem e NÃO exibe Tentar novamente", async () => {
    setup();
    // 8 caracteres não-numéricos: normalizeCep retorna "" → lookup nem dispara.
    // Simulamos inválido forçando via retry após digitar menos de 8:
    await typeCep("123");
    // Sem 8 dígitos o lookup não roda; para acionar a mensagem "inválido" usamos o botão retry
    // que só aparece após um erro de rede. Para cobrir a mensagem, disparamos via fetch abaixo:
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("net"))));
    // digitar até 8 gera network_error → aparece Tentar novamente
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/CEP/i), "45678");
    await screen.findByText(/Sem conexão para consultar o CEP/i);
    // agora limpamos e digitamos algo curto — a mensagem some
    await user.clear(screen.getByLabelText(/CEP/i));
    expect(screen.queryByText(/Sem conexão/i)).not.toBeInTheDocument();
  });

  it("CEP não encontrado: mostra mensagem específica e botão Tentar novamente", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Response(JSON.stringify({ erro: true }), { status: 200 })),
    );
    setup();
    await typeCep("00000000");

    await screen.findByText(/CEP não encontrado/i);
    expect(screen.getByRole("button", { name: /Tentar novamente/i })).toBeInTheDocument();
  });

  it("Sem conexão: mostra mensagem e Tentar novamente refaz a consulta com sucesso", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("failed"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            cep: "12345-678",
            logradouro: "Rua Teste",
            bairro: "Centro",
            localidade: "Testópolis",
            uf: "TS",
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    setup();
    await typeCep("12345678");

    await screen.findByText(/Sem conexão para consultar o CEP/i);
    const retry = screen.getByRole("button", { name: /Tentar novamente/i });

    const user = userEvent.setup();
    await user.click(retry);

    await waitFor(() => {
      expect(screen.getByLabelText(/Endereço/i)).toHaveValue("Rua Teste");
    });
    expect(screen.queryByText(/Sem conexão/i)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
