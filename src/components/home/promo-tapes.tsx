import { cn } from "@/lib/cn";

const INFO = ["Envío en 48 h en Lima", "Todo el Perú con Shalom", "Yape · Plin · Tarjeta", "Recojo gratis en Gamarra"];

/**
 * Dos cintas cruzadas que corren en sentidos opuestos: la oscura con envíos y pagos, la amarilla con las promos
 * vigentes (amarillo = oferta). Sin promos queda solo la oscura. Con "reducir movimiento" quedan quietas.
 */
export function PromoTapes({ offers }: { offers: string[] }) {
  return (
    <section aria-label="Envíos, pagos y promociones" className={cn("relative overflow-hidden", offers.length ? "h-36 md:h-44" : "h-24 md:h-28")}>
      <p className="sr-only">{[...INFO, ...offers].join(". ")}</p>
      <Tape items={INFO} reverse className="top-7 rotate-3 border-y border-line bg-raised text-muted md:top-9 md:rotate-[1.5deg]" textClassName="text-2xl md:text-3xl" separatorClassName="text-white" />
      {offers.length ? (
        <Tape
          items={offers}
          className="top-16 -rotate-4 bg-offer text-black shadow-xl shadow-black/60 md:top-20 md:-rotate-2"
          textClassName="text-[2rem] md:text-[2.5rem]"
          heightClassName="h-14 md:h-16"
        />
      ) : null}
    </section>
  );
}

function Tape({
  items,
  reverse = false,
  className,
  textClassName,
  separatorClassName,
  heightClassName = "h-12 md:h-14",
}: {
  items: string[];
  reverse?: boolean;
  className?: string;
  textClassName?: string;
  separatorClassName?: string;
  heightClassName?: string;
}) {
  // Se repiten para que una copia siempre sea más ancha que la pantalla; dos copias dan la vuelta sin cortes.
  const repeated = Array.from({ length: Math.max(2, Math.ceil(8 / items.length)) }, () => items).flat();
  const copy = (key: string) => (
    <ul key={key} className="flex shrink-0 items-center">
      {repeated.map((text, i) => (
        <li key={i} className="flex items-center gap-5 pr-5 whitespace-nowrap">
          {text}
          <span className={separatorClassName}>{"///"}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div aria-hidden className={cn("absolute -inset-x-10 flex items-center overflow-hidden", heightClassName, className)}>
      <div className={cn("flex w-max font-display leading-none font-black uppercase motion-reduce:animate-none", reverse ? "animate-marquee-reverse" : "animate-marquee", textClassName)}>
        {copy("a")}
        {copy("b")}
      </div>
    </div>
  );
}
