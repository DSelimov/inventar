"use client";

import { ImagePlus, ImageOff, Loader2, Star, Trash2 } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { removeItemImage, setPrimaryImage, uploadItemImages, type UploadState } from "@/lib/actions/item-images";
import { cn } from "@/lib/utils";
import { Form } from "@/components/ui/form";

export type GalleryImage = { id: number; full: string; thumb: string; width: number; height: number };

const MAX_MB = 10;

/** Снимки на артикул: голяма снимка, миниатюри, качване, главна снимка и изтриване. */
export function ItemGallery({
  itemId,
  title,
  images,
  editable,
  inheritedFrom,
  maxImages,
}: {
  itemId: number;
  title: string;
  images: GalleryImage[];
  editable: boolean;
  /** Вариант без собствени снимки показва снимките на основния артикул. */
  inheritedFrom?: string;
  maxImages: number;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = images.find((i) => i.id === selectedId) ?? images[0];
  const own = !inheritedFrom;

  return (
    <div>
      {selected ? (
        <a href={selected.full} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-line bg-surface-2" title="Отвори в пълен размер">
          {/* eslint-disable-next-line @next/next/no-img-element -- защитени файлове, без оптимизатора на Next */}
          <img src={selected.full} alt={title} width={selected.width} height={selected.height} className="aspect-square w-full object-contain" />
        </a>
      ) : (
        <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface-2 text-muted">
          <ImageOff className="h-8 w-8" />
          <span className="text-sm">Няма снимки</span>
        </div>
      )}

      {images.length > 1 && (
        <div className="mt-3 grid grid-cols-5 gap-2">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setSelectedId(img.id)}
              className={cn("relative overflow-hidden rounded-lg border-2 bg-surface-2", img.id === selected?.id ? "border-accent" : "border-transparent hover:border-line")}
              aria-label={`Снимка ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.thumb} alt="" className="aspect-square w-full object-cover" loading="lazy" />
              {i === 0 && <Star className="absolute top-1 left-1 h-3.5 w-3.5 fill-amber-400 text-amber-400 drop-shadow" />}
            </button>
          ))}
        </div>
      )}

      {inheritedFrom && images.length > 0 && <p className="mt-2 text-xs text-muted">Снимки на основния артикул „{inheritedFrom}“. Качете собствени снимки за този вариант.</p>}

      {editable && own && selected && (
        <div className="mt-3 flex flex-wrap gap-2">
          {selected.id !== images[0]?.id && (
            <Form action={setPrimaryImage.bind(null, selected.id)}>
              <Button type="submit" variant="secondary" size="sm">
                <Star className="h-3.5 w-3.5" />
                Направи главна
              </Button>
            </Form>
          )}
          <Form action={removeItemImage.bind(null, selected.id)} onSubmit={() => setSelectedId(null)}>
            <ConfirmButton variant="ghost" size="sm" message="Да изтрия ли тази снимка?">
              <Trash2 className="h-3.5 w-3.5" />
              Изтрий снимката
            </ConfirmButton>
          </Form>
        </div>
      )}

      {editable && (own ? images.length : 0) < maxImages && <UploadForm itemId={itemId} onUploaded={() => setSelectedId(null)} />}
    </div>
  );
}

function UploadForm({ itemId, onUploaded }: { itemId: number; onUploaded: () => void }) {
  const [state, action] = useActionState(async (prev: UploadState, fd: FormData) => {
    const result = await uploadItemImages(itemId, prev, fd);
    if (!result.error) onUploaded();
    return result;
  }, {});
  const [clientError, setClientError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const error = clientError ?? state.error;

  return (
    <form ref={formRef} action={action} className="mt-3">
      <label className="block">
        <input
          key={state.at}
          type="file"
          name="photos"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          multiple
          className="sr-only"
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files ?? []);
            const big = files.find((f) => f.size > MAX_MB * 1024 * 1024);
            setClientError(big ? `„${big.name}“ е по-голям от ${MAX_MB} MB.` : null);
            if (files.length && !big) formRef.current?.requestSubmit();
          }}
        />
        <UploadButton />
      </label>
      {error && <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
      {!error && state.added ? <p className="mt-2 text-xs text-success">{state.added === 1 ? "Снимката е добавена." : `Добавени са ${state.added} снимки.`}</p> : null}
    </form>
  );
}

function UploadButton() {
  const { pending } = useFormStatus();
  return (
    <span
      className={cn(
        "flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line text-sm font-medium text-muted transition-colors hover:border-accent hover:text-accent",
        pending && "pointer-events-none opacity-60",
      )}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
      {pending ? "Качване…" : "Добави снимки"}
    </span>
  );
}
