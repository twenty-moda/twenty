const PERKS = [
  { big: "24–48 h", text: "Delivery en Lima Metropolitana." },
  { big: "Todo el Perú", text: "Envíos a provincia por Shalom u Olva." },
  { big: "Yape · Plin", text: "O paga con tarjeta, seguro con Culqi." },
  { big: "Recojo gratis", text: "En nuestra tienda de Gamarra." },
];

export function Perks() {
  return (
    <section aria-label="Envíos y pagos" className="mx-auto max-w-7xl px-4 py-8 lg:px-6 lg:py-12 2xl:max-w-[96rem]">
      <ul className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
        {PERKS.map((perk) => (
          <li key={perk.big} className="reveal flex min-h-38 flex-col justify-between gap-3 rounded-2xl border border-line bg-surface p-4 lg:min-h-44 lg:p-6">
            <span className="font-display text-[2.125rem] leading-[0.9] font-black text-balance uppercase lg:text-5xl">{perk.big}</span>
            <span className="text-[13px] leading-snug text-white/80 lg:text-[15px]">{perk.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
