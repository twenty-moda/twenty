/**
 * Franja superior. Los mensajes pasan en marquesina (como en la web anterior) y en una sola línea,
 * así ocupa menos alto en el celular. Se detiene al pasar el mouse; con "reducir movimiento" queda fija.
 */
export function AnnouncementBar({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  // Se repiten para que una copia siempre sea más ancha que la pantalla; dos copias dan la vuelta sin cortes.
  const items = Array.from({ length: Math.max(2, Math.ceil(6 / messages.length)) }, () => messages).flat();
  const copy = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {items.map((message, i) => (
        <li key={i} className="flex items-center gap-6 pr-6 whitespace-nowrap">
          {message}
          <span aria-hidden className="size-1 rounded-full bg-black" />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="group overflow-hidden bg-white py-2 text-[11px] leading-snug font-semibold tracking-wide text-black uppercase print:hidden">
      <p className="sr-only">{messages.join(". ")}</p>
      <div aria-hidden className="flex w-max animate-marquee group-hover:[animation-play-state:paused] motion-reduce:hidden">
        {copy(false)}
        {copy(true)}
      </div>
      <p aria-hidden className="hidden px-4 text-center text-balance motion-reduce:block">
        {messages[0]}
      </p>
    </div>
  );
}
