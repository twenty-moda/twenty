import { ChevronDown } from "lucide-react";
import type { SiteSettings } from "@/server/services/content";
import { RichText } from "../ui/rich-text";

/** Preguntas frecuentes como acordeón nativo (<details>): funciona sin JavaScript. */
export function FaqList({ faqs }: { faqs: SiteSettings["faqs"] }) {
  return (
    <div className="divide-y divide-line rounded-2xl border border-line">
      {faqs.map((faq) => (
        <details key={faq.question} className="group smooth-details">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
            {faq.question}
            <ChevronDown className="size-5 shrink-0 text-muted transition duration-300 group-open:rotate-180" aria-hidden />
          </summary>
          <RichText source={faq.answer} muted compact className="px-5 pb-5 text-[15px]" />
        </details>
      ))}
    </div>
  );
}
