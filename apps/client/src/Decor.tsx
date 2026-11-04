/** The mark of the table: a flame that rises into a four-pointed star. Drawn here, so it stays crisp at any size. */
export function Emblem() {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M16 28c-5 0-8.5-3.4-8.5-8 0-3.2 1.7-5.4 3.4-7.4 1.2-1.4 2.2-2.7 2.6-4.6 3.3 1.6 5.6 4.3 5.9 7.3 1-.7 1.6-1.8 1.8-3.1 1.8 2 2.8 4.2 2.8 6.6 0 4.8-3.5 9.2-8 9.2z" />
      <path d="M16 24c-2 0-3.2-1.4-3.2-3.1 0-1.8 1.3-2.8 3.2-5 1.9 2.2 3.2 3.2 3.2 5 0 1.700-1.200 3.100-3.200 3.100z" />
      <path d="M16 1.500l.9 2.600 2.600.9-2.600.9-.9 2.600-.9-2.600-2.600-.9 2.600-.9z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** A gold rule with a diamond, under a heading. */
export function Ornament() {
  return (
    <div className="ornament" aria-hidden="true">
      <i />
    </div>
  );
}
