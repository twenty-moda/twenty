import Image from "next/image";
import { cn } from "@/lib/cn";

/** Wordmark TWENTY (brand/logos/twenty-logo.webp, reducido a 720 px). Falta el vector: pedirlo al diseñador. */
export function Logo({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/twenty-logo.webp"
      alt="TWENTY"
      width={720}
      height={171}
      sizes="160px"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      className={cn("h-auto w-28", className)}
    />
  );
}
