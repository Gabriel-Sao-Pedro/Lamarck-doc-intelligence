import { deflateSync } from 'node:zlib';

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/** Gera um PNG 1x1 grayscale minimo, porem estruturalmente valido (assinatura + IHDR + IDAT + IEND). */
export function buildValidPng(): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(1, 0); // width
  ihdrData.writeUInt32BE(1, 4); // height
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(0, 9); // color type: grayscale
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace

  const rawScanline = Buffer.from([0x00, 0x00]); // filter byte + 1 pixel
  const idatData = deflateSync(rawScanline);

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdrData),
    pngChunk('IDAT', idatData),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** JPEG minimo com assinatura/trailer corretos; suficiente para a validacao por magic bytes desta fase. */
export function buildValidJpeg(): Buffer {
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const padding = Buffer.alloc(50, 0x00);
  const trailer = Buffer.from([0xff, 0xd9]);
  return Buffer.concat([header, padding, trailer]);
}

/** Um JPEG valido (magic bytes corretos) mas maior que o limite de 10 MB da API. */
export function buildOversizedJpeg(): Buffer {
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const padding = Buffer.alloc(11 * 1024 * 1024, 0x00);
  return Buffer.concat([header, padding]);
}

/** Conteudo de texto simples, sem relacao com JPEG/PNG, para simular extensao/MIME divergentes do conteudo real. */
export function buildFakeImageContent(): Buffer {
  return Buffer.from('isto nao e uma imagem de verdade, apenas texto com extensao .jpg', 'utf-8');
}
