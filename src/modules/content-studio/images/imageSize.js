'use strict';

// Pixel size of a PNG or JPEG from its header (no image library needed); null when unknown.
function imageSize(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  if (buffer.readUInt32BE(0) === 0x89504e47) return { type: 'png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      // SOF0–SOF15 carry the frame size (C4 DHT, C8 JPG, CC DAC are not frames).
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { type: 'jpg', height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
    return null;
  }
  return null;
}

// Fit inside a box (default ~15 cm wide in Word's 96-dpi pixels), keeping the aspect ratio.
function fitSize(size, maxWidth = 560, maxHeight = 380) {
  if (!size?.width || !size?.height) return null;
  const scale = Math.min(1, maxWidth / size.width, maxHeight / size.height);
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
}

module.exports = { imageSize, fitSize };
