// content-favicon.js — favicon bundle, ZIP encoder, ICO encoder
(function () {
  'use strict';
  const DS = window.__DS;

  DS.doFaviconBundle = async function (dataUrl) {
    const [ico, p96, p180, svg, p192, p512] = await Promise.all([
      DS.encodeICO(dataUrl, [16, 32, 48]),
      DS.resizeToPNG(dataUrl, 96),
      DS.resizeToPNG(dataUrl, 180),
      DS.encodeEmbeddedSVG(dataUrl),
      DS.resizeToPNG(dataUrl, 192),
      DS.resizeToPNG(dataUrl, 512),
    ]);

    const entries = [
      ['favicon.ico',                  ico],
      ['favicon-96x96.png',            p96],
      ['apple-touch-icon.png',         p180],
      ['favicon.svg',                  svg],
      ['web-app-manifest-192x192.png', p192],
      ['web-app-manifest-512x512.png', p512],
    ];

    const files = entries.map(([name, url]) => {
      const raw  = atob(url.split(',')[1]);
      const data = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
      return { name, data };
    });

    const zipBytes = buildZip(files);
    let binary = '';
    for (let i = 0; i < zipBytes.length; i += 8192)
      binary += String.fromCharCode(...zipBytes.subarray(i, i + 8192));
    await DS.triggerDownload(`data:application/zip;base64,${btoa(binary)}`, 'favicon.zip');
  };

  // ─── ZIP encoder (STORE, no compression) ─────────────────────────────────
  function buildZip(files) {
    const crcTable = makeCRCTable();
    const locals   = [];
    let offset = 0;

    for (const { name, data } of files) {
      const nameBytes = new TextEncoder().encode(name);
      const crc       = crc32(data, crcTable);
      const lh        = new ArrayBuffer(30 + nameBytes.length);
      const v         = new DataView(lh);
      v.setUint32(0,  0x04034b50, true);
      v.setUint16(4,  20,         true);
      v.setUint16(6,  0,          true);
      v.setUint16(8,  0,          true);
      v.setUint16(10, 0,          true);
      v.setUint16(12, 0,          true);
      v.setUint32(14, crc,        true);
      v.setUint32(18, data.length,true);
      v.setUint32(22, data.length,true);
      v.setUint16(26, nameBytes.length, true);
      v.setUint16(28, 0,          true);
      new Uint8Array(lh).set(nameBytes, 30);
      locals.push({ lh, data, nameBytes, crc, offset });
      offset += lh.byteLength + data.length;
    }

    const cdOffset = offset;
    const cds = locals.map(({ nameBytes, crc, data, offset: lo }) => {
      const cd = new ArrayBuffer(46 + nameBytes.length);
      const v  = new DataView(cd);
      v.setUint32(0,  0x02014b50,   true);
      v.setUint16(4,  20,           true);
      v.setUint16(6,  20,           true);
      v.setUint16(8,  0,            true);
      v.setUint16(10, 0,            true);
      v.setUint16(12, 0,            true);
      v.setUint16(14, 0,            true);
      v.setUint32(16, crc,          true);
      v.setUint32(20, data.length,  true);
      v.setUint32(24, data.length,  true);
      v.setUint16(28, nameBytes.length, true);
      v.setUint16(30, 0,            true);
      v.setUint16(32, 0,            true);
      v.setUint16(34, 0,            true);
      v.setUint16(36, 0,            true);
      v.setUint32(38, 0,            true);
      v.setUint32(42, lo,           true);
      new Uint8Array(cd).set(nameBytes, 46);
      return cd;
    });

    const cdSize = cds.reduce((n, cd) => n + cd.byteLength, 0);
    const eocd   = new ArrayBuffer(22);
    const ev     = new DataView(eocd);
    ev.setUint32(0,  0x06054b50,   true);
    ev.setUint16(4,  0,            true);
    ev.setUint16(6,  0,            true);
    ev.setUint16(8,  files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize,       true);
    ev.setUint32(16, cdOffset,     true);
    ev.setUint16(20, 0,            true);

    const total  = offset + cdSize + 22;
    const result = new Uint8Array(total);
    let pos = 0;
    for (const { lh, data } of locals) {
      result.set(new Uint8Array(lh), pos); pos += lh.byteLength;
      result.set(data,               pos); pos += data.length;
    }
    for (const cd of cds) { result.set(new Uint8Array(cd), pos); pos += cd.byteLength; }
    result.set(new Uint8Array(eocd), pos);
    return result;
  }

  function makeCRCTable() {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  }

  function crc32(data, table) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // ─── Image helpers ────────────────────────────────────────────────────────
  DS.resizeToPNG = async function (dataUrl, size) {
    const buf = await DS.resizeToPNGBuffer(dataUrl, size);
    const u8  = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < u8.length; i += 8192)
      binary += String.fromCharCode(...u8.subarray(i, i + 8192));
    return `data:image/png;base64,${btoa(binary)}`;
  };

  DS.resizeToPNGBuffer = function (dataUrl, size) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        c.getContext('2d').drawImage(img, 0, 0, size, size);
        c.toBlob(blob => blob.arrayBuffer().then(resolve), 'image/png');
      };
      img.src = dataUrl;
    });
  };

  DS.encodeEmbeddedSVG = function (dataUrl) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image href="${dataUrl}" width="512" height="512" preserveAspectRatio="xMidYMid slice"/></svg>`;
    const u8  = new TextEncoder().encode(svg);
    let binary = '';
    for (let i = 0; i < u8.length; i += 8192)
      binary += String.fromCharCode(...u8.subarray(i, i + 8192));
    return `data:image/svg+xml;base64,${btoa(binary)}`;
  };

  DS.encodeICO = async function (dataUrl, sizes = [16, 32, 48]) {
    const pngBuffers = await Promise.all(sizes.map(s => DS.resizeToPNGBuffer(dataUrl, s)));
    const DIR_HEADER = 6, ENTRY_SIZE = 16;
    const dataStart  = DIR_HEADER + ENTRY_SIZE * sizes.length;
    const totalBytes = dataStart + pngBuffers.reduce((n, b) => n + b.byteLength, 0);

    const buf  = new ArrayBuffer(totalBytes);
    const view = new DataView(buf);
    const u8   = new Uint8Array(buf);
    view.setUint16(0, 0, true);
    view.setUint16(2, 1, true);
    view.setUint16(4, sizes.length, true);

    let writeAt = dataStart;
    sizes.forEach((sz, i) => {
      const e = DIR_HEADER + i * ENTRY_SIZE;
      view.setUint8 (e,      sz);
      view.setUint8 (e + 1,  sz);
      view.setUint8 (e + 2,  0);
      view.setUint8 (e + 3,  0);
      view.setUint16(e + 4,  1,                        true);
      view.setUint16(e + 6,  32,                       true);
      view.setUint32(e + 8,  pngBuffers[i].byteLength, true);
      view.setUint32(e + 12, writeAt,                  true);
      u8.set(new Uint8Array(pngBuffers[i]), writeAt);
      writeAt += pngBuffers[i].byteLength;
    });

    let binary = '';
    for (let i = 0; i < u8.length; i += 8192)
      binary += String.fromCharCode(...u8.subarray(i, i + 8192));
    return `data:image/x-icon;base64,${btoa(binary)}`;
  };
})();
