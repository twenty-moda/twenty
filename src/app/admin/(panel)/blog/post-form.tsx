"use client";

import { ExternalLink, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { FieldError, FormAlert, SubmitButton, Toggle } from "@/components/admin/form-controls";
import { ImageInput } from "@/components/admin/image-input";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { buttonClass } from "@/components/admin/ui";
import { inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { slugify } from "@/lib/slug";
import { idle, type ActionState } from "../../_lib/action-state";
import { deletePostAction, savePostAction } from "./actions";

export type PostFormValues = {
  id: string | null;
  title: string;
  slug: string;
  summary: string;
  body: string;
  category: string;
  author: string;
  isPublished: boolean;
  publishedAt: string;
  metaTitle: string;
  metaDescription: string;
  image: string | null;
};

function Input({ label, name, state, defaultValue, hint, placeholder, list, type = "text", maxLength }: { label: string; name: string; state: ActionState; defaultValue?: string; hint?: string; placeholder?: string; list?: string; type?: string; maxLength?: number }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input type={type} name={name} defaultValue={defaultValue} placeholder={placeholder} list={list} maxLength={maxLength} aria-invalid={!!state.fieldErrors?.[name]} className={inputClass} />
      <FieldError state={state} name={name} />
      {hint ? <span className="mt-1.5 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function PostForm({ post, categories, created }: { post: PostFormValues; categories: string[]; created?: boolean }) {
  const [state, action] = useActionState(savePostAction.bind(null, post.id), created ? { status: "success" as const, message: "Artículo creado.", at: 1 } : idle);
  const [title, setTitle] = useState(post.title);
  const [deleting, startDelete] = useTransition();
  const slugPreview = post.slug || slugify(title) || "…";

  return (
    <form action={action} className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-4 rounded-2xl border border-line bg-surface p-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Título</span>
          <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} aria-invalid={!!state.fieldErrors?.title} className={cn(inputClass, "text-lg font-semibold")} />
          <FieldError state={state} name="title" />
        </label>
        <RichTextEditor
          name="body"
          label="Artículo"
          defaultValue={post.body}
          error={state.fieldErrors?.body}
          hint="Usa los botones para títulos, negritas y listas. Deja una línea en blanco entre párrafos."
        />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Resumen (opcional)</span>
          <textarea name="summary" rows={3} maxLength={300} defaultValue={post.summary} className={cn(inputClass, "h-auto py-3")} />
          <span className="mt-1.5 block text-xs text-muted">Se ve en la lista del blog. Si lo dejas vacío, se usa el primer párrafo.</span>
        </label>
      </div>

      <div className="space-y-4">
        <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
          <Toggle name="isPublished" defaultChecked={post.isPublished} label="Publicado" hint="Apagado = borrador, no se ve en la tienda." />
          <Input label="Fecha" name="publishedAt" type="date" state={state} defaultValue={post.publishedAt} hint="Vacío = hoy. Con fecha futura, se publica ese día." />
          <Input label="Categoría" name="category" state={state} defaultValue={post.category} list="post-categories" placeholder="Estilo y Tendencias" />
          <datalist id="post-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <Input label="Autor" name="author" state={state} defaultValue={post.author || "TWENTY"} />
          <ImageInput name="image" label="Foto principal" current={post.image} maxSize={1600} />
        </div>

        <details className="rounded-2xl border border-line bg-surface p-5">
          <summary className="cursor-pointer text-sm font-semibold">URL y Google (opcional)</summary>
          <div className="mt-4 space-y-4">
            <Input label="URL" name="slug" state={state} defaultValue={post.slug} hint={`twentymoda.com/post/${slugPreview}. Si la cambias, los enlaces que ya compartiste dejan de funcionar.`} />
            <Input label="Título para Google" name="metaTitle" state={state} defaultValue={post.metaTitle} maxLength={70} hint="Máximo 60–70 caracteres. Vacío = el título." />
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Descripción para Google</span>
              <textarea name="metaDescription" rows={3} maxLength={170} defaultValue={post.metaDescription} className={cn(inputClass, "h-auto py-3")} />
              <span className="mt-1.5 block text-xs text-muted">Máximo 160 caracteres. Vacío = el resumen.</span>
            </label>
          </div>
        </details>

        <FormAlert state={state} />
        <SubmitButton className="w-full">{post.id ? "Guardar" : "Crear artículo"}</SubmitButton>
        {post.id ? (
          <div className="flex flex-wrap gap-2">
            {post.isPublished ? (
              <a href={`/post/${post.slug}`} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
                <ExternalLink className="size-4" aria-hidden /> Ver en la tienda
              </a>
            ) : null}
            <button
              type="button"
              disabled={deleting}
              onClick={() => {
                if (confirm("¿Borrar este artículo? No se puede deshacer.")) startDelete(() => deletePostAction(post.id!));
              }}
              className={buttonClass("danger", "sm")}
            >
              <Trash2 className="size-4" aria-hidden /> Borrar
            </button>
          </div>
        ) : null}
      </div>
    </form>
  );
}
