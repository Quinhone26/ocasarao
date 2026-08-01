import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, ShoppingBag, Loader2, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { describeError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { useProdutos, cartTotal, cartToText, type CartItem, type Produto } from "@/lib/produtos";
import { formatBRL } from "@/lib/deliveries";
import { upsertClienteFromDelivery } from "@/lib/clientes";
import { formatCep, isValidCep, lookupCep, isAllowedCity, ALLOWED_CITY, ALLOWED_UF } from "@/lib/cep";
import { formatPhone, normalizeBrPhone } from "@/lib/masks";
import { generateTrackCode, buildTrackUrl } from "@/lib/tracking";
import { useCompanySettings } from "@/lib/company-settings";
import { newId } from "@/lib/utils";
import { PixQrCode } from "@/components/PixQrCode";

export const Route = createFileRoute("/pedido")({
  head: () => ({
    meta: [
      { title: "Fazer pedido — O Casarão" },
      {
        name: "description",
        content:
          "Monte seu pedido no cardápio do O Casarão e receba em casa em Umuarama-PR com rastreio ao vivo do entregador.",
      },
      { property: "og:title", content: "Fazer pedido — O Casarão" },
      {
        property: "og:description",
        content: "Peça pelo cardápio online e acompanhe a entrega ao vivo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PedidoPage,
});

const PAGAMENTOS = ["Dinheiro", "Pix", "Cartão na entrega"] as const;
const TAXA_ENTREGA = 8;


function PedidoPage() {
  const { items: produtos, loading, error } = useProdutos(true);
  const [company] = useCompanySettings();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [step, setStep] = useState<"menu" | "dados">("menu");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ track: string | null } | null>(null);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [complemento, setComplemento] = useState("");
  const [pagamento, setPagamento] = useState<string>(PAGAMENTOS[0]);
  const [tipoEntrega, setTipoEntrega] = useState<"entrega" | "retirada">("entrega");
  const [troco, setTroco] = useState("");
  const [obs, setObs] = useState("");
  const [cepBusy, setCepBusy] = useState(false);
  const [cepErro, setCepErro] = useState<string | null>(null);
  const [cepAviso, setCepAviso] = useState<string | null>(null);


  const subtotal = useMemo(() => cartTotal(cart), [cart]);
  const taxaEntrega = tipoEntrega === "entrega" ? TAXA_ENTREGA : 0;
  const total = subtotal + taxaEntrega;
  const qtdTotal = useMemo(() => cart.reduce((s, i) => s + i.qtd, 0), [cart]);


  const categorias = useMemo(() => {
    const map = new Map<string, Produto[]>();
    for (const p of produtos) {
      const k = p.categoria || "Geral";
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return [...map.entries()];
  }, [produtos]);

  function addItem(p: Produto) {
    setCart((prev) => {
      const found = prev.find((i) => i.produto.id === p.id);
      if (found) return prev.map((i) => (i.produto.id === p.id ? { ...i, qtd: i.qtd + 1 } : i));
      return [...prev, { produto: p, qtd: 1 }];
    });
  }

  function subItem(p: Produto) {
    setCart((prev) =>
      prev
        .map((i) => (i.produto.id === p.id ? { ...i, qtd: i.qtd - 1 } : i))
        .filter((i) => i.qtd > 0),
    );
  }

  async function handleCepBlur() {
    const digits = cep.replace(/\D/g, "");
    if (!digits) return;
    setCep(formatCep(digits));
    setCepAviso(null);
    if (!isValidCep(digits)) {
      setCepErro("CEP inválido — precisa ter 8 dígitos.");
      return;
    }
    setCepErro(null);
    setCepBusy(true);
    const res = await lookupCep(digits);
    setCepBusy(false);
    if (res.status !== "ok") {
      // Falha de rede/serviço não deve bloquear o pedido: é só um aviso.
      setCepAviso("Não consegui buscar esse CEP. Preencha o endereço manualmente.");
      return;
    }
    if (!isAllowedCity(res.data.localidade, res.data.uf)) {
      setCepErro(
        `Desculpe, entregamos somente em ${ALLOWED_CITY}-${ALLOWED_UF}. Esse CEP é de ${res.data.localidade}-${res.data.uf}.`,
      );
      return;
    }
    setCepErro(null);
    if (res.data.logradouro) setEndereco(res.data.logradouro);
    if (res.data.bairro) setBairro(res.data.bairro);
  }

  async function enviarPedido() {
    const entrega = tipoEntrega === "entrega";
    if (!nome.trim()) return toast.error("Informe seu nome.");
    if (!normalizeBrPhone(telefone)) return toast.error("Informe um WhatsApp válido com DDD.");
    if (entrega && !endereco.trim()) return toast.error("Informe o endereço da entrega.");
    if (entrega && cepErro) return toast.error(cepErro);
    if (cart.length === 0) return toast.error("Seu carrinho está vazio.");
    if (entrega && !cep.trim()) return toast.error("Informe o CEP da entrega.");

    if (total <= 0) return toast.error("Valor do pedido inválido.");

    const trackCode = generateTrackCode();
    const detalhes = [
      `PEDIDO ONLINE: ${cartToText(cart)}`,
      entrega ? `Entrega (taxa ${formatBRL(taxaEntrega)})` : "RETIRADA NO LOCAL",
      `Pagamento: ${pagamento}${pagamento === "Dinheiro" && troco.trim() ? ` (troco para ${troco.trim()})` : ""}`,
      obs.trim() ? `Obs: ${obs.trim()}` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    setSending(true);
    const { error: insertError } = await supabase.from("deliveries").insert({
      id: newId(),
      cliente: nome.trim(),
      telefone: telefone.trim(),
      cep: entrega ? cep.trim() : "",
      endereco: entrega ? endereco.trim() : "RETIRADA NO LOCAL",
      numero: entrega ? numero.trim() : "",
      bairro: entrega ? bairro.trim() : "",
      cidade: ALLOWED_CITY,
      complemento: entrega ? complemento.trim() : "",
      observacoes: detalhes,
      valor: total,
      data_hora: new Date().toISOString(),
      agendado_para: null,
      lat: null,
      lng: null,
      status: "pendente",
      pago: false,
      criado_em: new Date().toISOString(),
      track_code: trackCode,
    });

    setSending(false);

    if (insertError) {
      console.error("[pedido] insert", insertError);
      toast.error("Não consegui enviar seu pedido. Tente novamente.", {
        description: describeError(insertError),
      });
      return;
    }

    // Salva/atualiza o cadastro do cliente igual ao pedido manual.
    if (entrega) {
      await upsertClienteFromDelivery({
        cliente: nome.trim(),
        telefone: telefone.trim(),
        cep: cep.trim(),
        endereco: endereco.trim(),
        numero: numero.trim(),
        bairro: bairro.trim(),
        cidade: ALLOWED_CITY,
        complemento: complemento.trim(),
      });
    } else {
      await upsertClienteFromDelivery({
        cliente: nome.trim(),
        telefone: telefone.trim(),
      });
    }

    setDone({ track: trackCode });
  }

  useEffect(() => {
    if (done) window.scrollTo({ top: 0 });
  }, [done]);

  if (done) {
    const url = buildTrackUrl(done.track);
    return (
      <main className="min-h-screen bg-background px-4 py-10">
        <div className="mx-auto max-w-md text-center">
          <CheckCircle2 className="mx-auto w-14 h-14 text-status-delivered" />
          <h1 className="mt-4 text-2xl font-bold">Pedido enviado!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Recebemos seu pedido de {formatBRL(total)}. Em instantes ele sai para entrega.
          </p>
          {pagamento === "Pix" && total > 0 && (
            <div className="mt-5 text-left">
              <PixQrCode
                amount={total}
                merchantName={company.nome}
                customerName={nome.trim()}
                trackCode={done.track}
              />

            </div>
          )}
          {url && (
            <Button asChild className="mt-6 w-full">
              <a href={url}>Acompanhar minha entrega</a>
            </Button>
          )}
          <Button
            variant="outline"
            className="mt-3 w-full"
            onClick={() => {
              setCart([]);
              setDone(null);
              setStep("menu");
            }}
          >
            Fazer outro pedido
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-20 bg-primary text-primary-foreground px-4 py-4 shadow-elevated">
        <div className="mx-auto max-w-xl flex items-center gap-3">
          <img src="/icon-192.png" alt="" className="w-10 h-10 rounded-xl object-cover" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{company.nome || "O Casarão"}</h1>
            <p className="text-xs text-primary-foreground/70">
              Cardápio online · entregas em {ALLOWED_CITY}-{ALLOWED_UF}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-4 pt-4">
        {step === "menu" ? (
          <>
            {loading && (
              <div className="py-16 grid place-items-center text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            )}
            {!loading && error && (
              <p className="py-10 text-center text-sm text-destructive">
                Não consegui carregar o cardápio agora.
              </p>
            )}
            {!loading && !error && produtos.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                O cardápio ainda não tem produtos cadastrados.
              </p>
            )}

            {categorias.map(([cat, lista]) => (
              <section key={cat} className="mb-6">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {cat}
                </h2>
                <div className="space-y-2">
                  {lista.map((p) => {
                    const qtd = cart.find((i) => i.produto.id === p.id)?.qtd ?? 0;
                    return (
                      <article
                        key={p.id}
                        className="flex gap-3 items-center rounded-xl border bg-card p-3"
                      >
                        {p.imagemUrl && (
                          <img
                            src={p.imagemUrl}
                            alt={p.nome}
                            loading="lazy"
                            className="w-16 h-16 rounded-lg object-cover"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold leading-tight">{p.nome}</h3>
                          {p.descricao && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{p.descricao}</p>
                          )}
                          <p className="mt-1 text-sm font-bold text-primary">{formatBRL(p.preco)}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {qtd > 0 && (
                            <>
                              <Button size="icon" variant="outline" onClick={() => subItem(p)} aria-label={`Remover ${p.nome}`}>
                                <Minus className="w-4 h-4" />
                              </Button>
                              <span className="w-5 text-center text-sm font-semibold">{qtd}</span>
                            </>
                          )}
                          <Button size="icon" onClick={() => addItem(p)} aria-label={`Adicionar ${p.nome}`}>
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </>
        ) : (
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Dados do pedido</h2>
            <div>
              <Label>Como você quer receber?</Label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={tipoEntrega === "entrega" ? "default" : "outline"}
                  onClick={() => setTipoEntrega("entrega")}
                  className="h-auto py-2 flex-col gap-0.5"
                >
                  <span className="font-semibold">Entrega</span>
                  <span className="text-[11px] opacity-80">+ {formatBRL(TAXA_ENTREGA)}</span>
                </Button>
                <Button
                  type="button"
                  variant={tipoEntrega === "retirada" ? "default" : "outline"}
                  onClick={() => setTipoEntrega("retirada")}
                  className="h-auto py-2 flex-col gap-0.5"
                >
                  <span className="font-semibold">Retirar no local</span>
                  <span className="text-[11px] opacity-80">sem taxa</span>
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="tel">WhatsApp *</Label>
              <Input
                id="tel"
                inputMode="tel"
                value={telefone}
                onChange={(e) => setTelefone(formatPhone(e.target.value))}
                placeholder="(44) 90000-0000"
              />
            </div>
            {tipoEntrega === "entrega" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="cep">CEP</Label>
                    <Input
                      id="cep"
                      inputMode="numeric"
                      value={cep}
                      onChange={(e) => { setCep(formatCep(e.target.value)); setCepErro(null); }}
                      onBlur={handleCepBlur}
                      placeholder="87500-000"
                    />
                  </div>
                  <div>
                    <Label htmlFor="num">Número</Label>
                    <Input id="num" value={numero} onChange={(e) => setNumero(e.target.value)} />
                  </div>
                </div>
                {cepBusy && <p className="text-xs text-muted-foreground">Buscando CEP…</p>}
                {cepErro && <p className="text-xs text-destructive">{cepErro}</p>}
                {!cepErro && cepAviso && (
                  <p className="text-xs text-muted-foreground">{cepAviso}</p>
                )}

                <div>
                  <Label htmlFor="end">Endereço *</Label>
                  <Input id="end" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="bairro">Bairro</Label>
                    <Input id="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="compl">Complemento</Label>
                    <Input id="compl" value={complemento} onChange={(e) => setComplemento(e.target.value)} />
                  </div>
                </div>
              </>
            )}

            <div>
              <Label>Pagamento</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {PAGAMENTOS.map((p) => (
                  <Button
                    key={p}
                    type="button"
                    size="sm"
                    variant={pagamento === p ? "default" : "outline"}
                    onClick={() => setPagamento(p)}
                  >
                    {p}
                  </Button>
                ))}
              </div>
            </div>
            {pagamento === "Dinheiro" && (
              <div>
                <Label htmlFor="troco">Troco para</Label>
                <Input
                  id="troco"
                  value={troco}
                  onChange={(e) => setTroco(e.target.value)}
                  placeholder="Ex.: R$ 100,00"
                />
              </div>
            )}
            {pagamento === "Pix" && total > 0 && (
              <PixQrCode amount={total} merchantName={company.nome} customerName={nome.trim()} />
            )}
            <div>
              <Label htmlFor="obs">Observações</Label>
              <Textarea id="obs" value={obs} onChange={(e) => setObs(e.target.value)} rows={3} />
            </div>

            <div className="rounded-xl border bg-card p-3 text-sm">
              <p className="font-semibold mb-1">Resumo</p>
              {cart.map((i) => (
                <div key={i.produto.id} className="flex justify-between text-muted-foreground">
                  <span>
                    {i.qtd}x {i.produto.nome}
                  </span>
                  <span>{formatBRL(i.produto.preco * i.qtd)}</span>
                </div>
              ))}
              <div className="mt-2 flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatBRL(subtotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{tipoEntrega === "entrega" ? "Taxa de entrega" : "Retirada no balcão"}</span>
                <span>{taxaEntrega > 0 ? formatBRL(taxaEntrega) : "Grátis"}</span>
              </div>
              <div className="mt-2 flex justify-between font-bold">
                <span>Total</span>
                <span>{formatBRL(total)}</span>
              </div>
            </div>


            <Button variant="ghost" className="w-full" onClick={() => setStep("menu")}>
              Voltar ao cardápio
            </Button>
          </section>
        )}
      </div>

      {qtdTotal > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 border-t bg-background/95 backdrop-blur px-4 py-3">
          <div className="mx-auto max-w-xl flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">
                {qtdTotal} {qtdTotal === 1 ? "item" : "itens"}
              </p>
              <p className="font-bold">{formatBRL(total)}</p>
            </div>
            {step === "menu" ? (
              <Button onClick={() => setStep("dados")} className="gap-2">
                <ShoppingBag className="w-4 h-4" /> Continuar
              </Button>
            ) : (
              <Button onClick={enviarPedido} disabled={sending} className="gap-2">
                {sending && <Loader2 className="w-4 h-4 animate-spin" />}
                Enviar pedido
              </Button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
