import sharp from 'sharp';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'src-tauri', 'icons');

// Aurora gradient colors
const primaryColor = '#007AFF';
const secondaryColor = '#5856D6';

// Create a simple gradient circle icon as SVG
function createIconSVG(size) {
  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="aurora" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${primaryColor};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${secondaryColor};stop-opacity:1" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="${size * 0.02}" stdDeviation="${size * 0.04}" flood-color="#000" flood-opacity="0.3"/>
    </filter>
  </defs>
  <circle cx="${size/2}" cy="${size/2}" r="${size * 0.42}" fill="url(#aurora)" filter="url(#shadow)"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size * 0.28}" fill="rgba(255,255,255,0.25)"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size * 0.15}" fill="rgba(255,255,255,0.9)"/>
</svg>`;
}

async function generateIcons() {
  // Create icons directory
  await mkdir(iconsDir, { recursive: true });

  // Icon sizes needed for Tauri
  const sizes = [32, 128, 256, 512];

  for (const size of sizes) {
    const svg = Buffer.from(createIconSVG(size));
    const pngBuffer = await sharp(svg).png().toBuffer();

    if (size === 32) {
      await writeFile(join(iconsDir, '32x32.png'), pngBuffer);
    }
    if (size === 128) {
      await writeFile(join(iconsDir, '128x128.png'), pngBuffer);
      // Also create @2x version
      const svg2x = Buffer.from(createIconSVG(256));
      const png2xBuffer = await sharp(svg2x).png().toBuffer();
      await writeFile(join(iconsDir, '128x128@2x.png'), png2xBuffer);
    }
    if (size === 512) {
      await writeFile(join(iconsDir, 'icon.png'), pngBuffer);
    }
  }

  // Create ICO for Windows (using 256x256)
  const svg256 = Buffer.from(createIconSVG(256));
  const ico256 = await sharp(svg256).png().toBuffer();
  await writeFile(join(iconsDir, 'icon.ico'), ico256);

  // Create ICNS placeholder (macOS) - using PNG as placeholder
  const svg512 = Buffer.from(createIconSVG(512));
  const icns512 = await sharp(svg512).png().toBuffer();
  await writeFile(join(iconsDir, 'icon.icns'), icns512);

  console.log('Icons generated successfully!');
  console.log('Note: icon.ico and icon.icns are PNG files as placeholders.');
  console.log('For production, use proper ICO/ICNS converters.');
}

generateIcons().catch(console.error);
