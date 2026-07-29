/* Genera le icone PWA a partire dal marchio.
   Si rilancia con:  node scripts/genera-icone.mjs
   Le PNG prodotte finiscono in public/assets/ e vanno versionate. */

import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const QUI = dirname(fileURLToPath(import.meta.url));
const FUORI = resolve(QUI, '..', 'public', 'assets');

const CREMA = '#fbf7f0';
const TERRA = '#b8461f';
const OLIVA = '#5a6b33';

/** Il marchio: una scodella con un ramo d'olivo. `scala` e' la quota del
 *  disegno rispetto alla tela — sulle maskable serve piu' margine, perche'
 *  Android ritaglia fino al 20% per lato. */
function marchio({ lato, sfondo, scala, raggio }) {
  const d = Math.round(lato * scala);
  const off = Math.round((lato - d) / 2);
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${lato}" height="${lato}" viewBox="0 0 ${lato} ${lato}">
  <rect width="${lato}" height="${lato}" rx="${raggio}" fill="${sfondo}"/>
  <g transform="translate(${off} ${off}) scale(${d / 32})"
     fill="none" stroke="${TERRA}" stroke-width="1.9"
     stroke-linecap="round" stroke-linejoin="round">
    <path d="M3.5 16.8h25c0 6.6-5.6 11.9-12.5 11.9S3.5 23.4 3.5 16.8z"/>
    <g stroke="${OLIVA}">
      <path d="M16 16.8c-.7-6 1.9-10.6 7.8-13.5"/>
      <path d="M20.1 8.1c-2.9-.5-4.5.7-4.8 3.7 2.9.5 4.5-.7 4.8-3.7z"/>
      <path d="M24.4 3.6c-2.8.6-3.8 2.2-3 5 2.8-.6 3.8-2.2 3-5z"/>
    </g>
  </g>
</svg>`);
}

const LAVORI = [
  { file: 'icona-192.png', lato: 192, sfondo: CREMA, scala: 0.66, raggio: 40 },
  { file: 'icona-512.png', lato: 512, sfondo: CREMA, scala: 0.66, raggio: 108 },
  // Maskable: fondo pieno fino ai bordi e disegno piu' piccolo, dentro la
  // "zona sicura" del 40% centrale che Android garantisce di non ritagliare.
  { file: 'icona-maskable-512.png', lato: 512, sfondo: CREMA, scala: 0.46, raggio: 0 },
  { file: 'apple-touch-icon.png', lato: 180, sfondo: CREMA, scala: 0.66, raggio: 0 },
];

for (const l of LAVORI) {
  const png = await sharp(marchio(l)).png().toBuffer();
  writeFileSync(resolve(FUORI, l.file), png);
  console.log(`${l.file}  ${png.length} byte`);
}

// Favicon SVG: la scheda del browser la preferisce, resta nitida a ogni misura.
writeFileSync(
  resolve(FUORI, 'favicon.svg'),
  marchio({ lato: 32, sfondo: CREMA, scala: 0.84, raggio: 6 }).toString(),
);
console.log('favicon.svg');
