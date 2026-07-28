import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Plus, Pencil, Trash2, Copy, Loader2, ImagePlus } from "lucide-react";
import { uploadProdutoImagem } from "@/lib/upload-imagem";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useProdutos, type Produto } from "@/lib/produtos";
import { formatBRL } from "@/lib/deliveries";
import { formatCurrencyFromDigits, parseCurrencyToNumber, currencyMaskFromNumber } from "@/lib/masks";

export const Route = createFileRoute("/cardapio")({
  head: () => ({
    meta: [
      { title: "Cardápio — O Casarão" },
      {
        name: "description",
        content: "Cadastre e edite os produtos do cardápio online enviado aos clientes.",
      },
      { property: "og:title", content: "Cardápio — O Casarão" },
      { property: "og:description", content: "Gestão dos produtos do cardápio online." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CardapioAdmin,
});

const EMPTY = {
  nome: "",
  descricao: "",
  categoria: "Geral",
  precoMask: "",
  imagemUrl: "",
  ativo: true,
  ordem: 0,
};

function CardapioAdmin() {
  const { items, loading, error, create, update, remove } = useProdutos(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Produto | undefined>();
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadProdutoImagem(file);
      setForm((f) => ({ ...f, imagemUrl: url }));
      toast.success("Imagem enviada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar imagem");
    } finally {
      setUploading(false);
    }
  }


  function openNew() {
    setEditing(undefined);
    setForm({ ...EMPTY });
    setOpen(true);
  }

  function openEdit(p: Produto) {
    setEditing(p);
    setForm({
      nome: p.nome,
      descricao: p.descricao,
      categoria: p.categoria,
      precoMask: currencyMaskFromNumber(p.preco),
      imagemUrl: p.imagemUrl ?? "",
      ativo: p.ativo,
      ordem: p.ordem,
    });
    setOpen(true);
  }

  async function save() {
    if (!form.nome.trim()) {
      toast.error("Informe o nome do produto.");
      return;
    }
    const payload = {
      nome: form.nome.trim(),
      descricao: form.descricao.trim(),
      categoria: form.categoria.trim() || "Geral",
      preco: parseCurrencyToNumber(form.precoMask),
      imagemUrl: form.imagemUrl.trim() || null,
      ativo: form.ativo,
      ordem: Number(form.ordem) || 0,
    };
    setSaving(true);
    try {
      if (editing) await update(editing.id, payload);
      else await create(payload);
      toast.success(editing ? "Produto atualizado" : "Produto criado");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function copiarLink() {
    const url = `${window.location.origin}/pedido`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link do cardápio copiado!");
    } catch {
      toast.info(url);
    }
  }

  return (
    <main className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-20 bg-primary text-primary-foreground px-4 py-4 shadow-elevated">
        <div className="mx-auto max-w-xl flex items-center gap-3">
          <Link to="/" aria-label="Voltar" className="p-2 -ml-2 rounded-lg hover:bg-primary-foreground/10">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold">Cardápio</h1>
            <p className="text-xs text-primary-foreground/70">Produtos do pedido online</p>
          </div>
          <Button size="sm" variant="secondary" onClick={copiarLink} className="gap-1.5">
            <Copy className="w-4 h-4" /> Link
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-4 pt-4 space-y-3">
        <Button onClick={openNew} className="w-full gap-2">
          <Plus className="w-4 h-4" /> Novo produto
        </Button>

        {loading && (
          <div className="py-10 grid place-items-center text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive">
            Não consegui carregar os produtos. Rode a migração `docs/pending-migrations/cardapio.sql`.
          </p>
        )}
        {!loading && !error && items.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum produto cadastrado ainda.
          </p>
        )}

        {items.map((p) => (
          <article key={p.id} className="flex gap-3 items-center rounded-xl border bg-card p-3">
            {p.imagemUrl && (
              <img src={p.imagemUrl} alt={p.nome} loading="lazy" className="w-14 h-14 rounded-lg object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold leading-tight truncate">{p.nome}</h2>
              <p className="text-xs text-muted-foreground truncate">
                {p.categoria} · {formatBRL(p.preco)} {p.ativo ? "" : "· inativo"}
              </p>
            </div>
            <Button size="icon" variant="outline" onClick={() => openEdit(p)} aria-label={`Editar ${p.nome}`}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              aria-label={`Excluir ${p.nome}`}
              onClick={async () => {
                if (!window.confirm(`Excluir ${p.nome}?`)) return;
                try {
                  await remove(p.id);
                  toast.success("Produto excluído");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Erro ao excluir");
                }
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </article>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="p-nome">Nome *</Label>
              <Input id="p-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="p-desc">Descrição</Label>
              <Textarea
                id="p-desc"
                rows={2}
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="p-cat">Categoria</Label>
                <Input
                  id="p-cat"
                  value={form.categoria}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="p-preco">Preço</Label>
                <Input
                  id="p-preco"
                  inputMode="numeric"
                  value={form.precoMask}
                  onChange={(e) => setForm({ ...form, precoMask: formatCurrencyFromDigits(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="p-img">Foto do produto (opcional)</Label>
              <div className="mt-1 flex items-center gap-3">
                {form.imagemUrl ? (
                  <img
                    src={form.imagemUrl}
                    alt="Prévia do produto"
                    className="w-16 h-16 rounded-lg object-cover border"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg border border-dashed grid place-items-center text-muted-foreground">
                    <ImagePlus className="w-5 h-5" />
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <Input
                    id="p-img"
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={handleFile}
                  />
                  {uploading && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Enviando imagem…
                    </p>
                  )}
                  {form.imagemUrl && !uploading && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setForm((f) => ({ ...f, imagemUrl: "" }))}
                    >
                      Remover foto
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <Label htmlFor="p-ordem">Ordem</Label>
                <Input
                  id="p-ordem"
                  inputMode="numeric"
                  value={String(form.ordem)}
                  onChange={(e) => setForm({ ...form, ordem: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch
                  id="p-ativo"
                  checked={form.ativo}
                  onCheckedChange={(v) => setForm({ ...form, ativo: v })}
                />
                <Label htmlFor="p-ativo">Ativo no cardápio</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
