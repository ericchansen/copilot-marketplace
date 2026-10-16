import { deflateSync, inflateSync } from "node:zlib";
import { crc32 } from "./files.mjs";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const COLOR_CHUNKS = new Set(["cHRM", "gAMA", "iCCP", "sRGB"]);
const MAX_IMAGE_PIXELS = 8_294_400;
export const BACKGROUND_TOLERANCE = 16;

export function normalizeBackgroundColor(value) {
    if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) {
        throw new Error("background_color must be a six-digit hex color such as #FFF7EE");
    }
    return value.toUpperCase();
}

function chunk(type, data) {
    const name = Buffer.from(type);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([length, name, data, checksum]);
}

function paeth(left, up, upperLeft) {
    const estimate = left + up - upperLeft;
    const leftDistance = Math.abs(estimate - left);
    const upDistance = Math.abs(estimate - up);
    const upperLeftDistance = Math.abs(estimate - upperLeft);
    return leftDistance <= upDistance && leftDistance <= upperLeftDistance ? left :
        upDistance <= upperLeftDistance ? up : upperLeft;
}

export function decodePng(bytes) {
    if (!Buffer.isBuffer(bytes) || !bytes.subarray(0, 8).equals(SIGNATURE)) {
        throw new Error("Transparent-background postprocessing requires a PNG");
    }
    let offset = 8;
    let header;
    let palette;
    let transparency;
    let complete = false;
    const imageData = [];
    const colorChunks = [];
    while (offset + 12 <= bytes.length) {
        const length = bytes.readUInt32BE(offset);
        const end = offset + 12 + length;
        if (end > bytes.length || crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) {
            throw new Error("Transparent-background postprocessing received a truncated PNG");
        }
        const type = bytes.toString("ascii", offset + 4, offset + 8);
        const data = bytes.subarray(offset + 8, end - 4);
        if (type === "IHDR") header = data;
        else if (type === "PLTE") palette = data;
        else if (type === "tRNS") transparency = data;
        else if (type === "IDAT") imageData.push(data);
        else if (COLOR_CHUNKS.has(type)) colorChunks.push({ type, data: Buffer.from(data) });
        else if (type === "IEND" && data.length === 0 && end === bytes.length) {
            complete = true;
            break;
        }
        offset = end;
    }
    if (!header || header.length !== 13 || !imageData.length || !complete) {
        throw new Error("Transparent-background postprocessing requires a complete PNG");
    }
    const width = header.readUInt32BE(0);
    const height = header.readUInt32BE(4);
    const bitDepth = header[8];
    const colorType = header[9];
    // shortcut: provider PNGs are 8-bit and non-interlaced; add Adam7 decoding if a provider changes format.
    if (!width || !height || bitDepth !== 8 || header[10] !== 0 || header[11] !== 0 || header[12] !== 0) {
        throw new Error("Transparent-background postprocessing supports non-interlaced 8-bit PNGs");
    }
    const pixelCount = width * height;
    if (!Number.isSafeInteger(pixelCount) || pixelCount > MAX_IMAGE_PIXELS) {
        throw new Error(`Transparent-background postprocessing supports at most ${MAX_IMAGE_PIXELS.toLocaleString("en-US")} pixels`);
    }
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
    if (!channels || (colorType === 3 && (!palette || palette.length % 3))) {
        throw new Error("Transparent-background postprocessing received an unsupported PNG color type");
    }
    const stride = width * channels;
    const packedLength = height * (stride + 1);
    let packed;
    try {
        packed = inflateSync(Buffer.concat(imageData), { maxOutputLength: packedLength });
    } catch (error) {
        throw new Error("Transparent-background postprocessing received invalid or oversized PNG scanlines", { cause: error });
    }
    if (packed.length !== packedLength) throw new Error("Transparent-background postprocessing received invalid PNG scanlines");
    const raw = Buffer.alloc(pixelCount * channels);
    for (let y = 0; y < height; y++) {
        const filter = packed[y * (stride + 1)];
        if (filter > 4) throw new Error("Transparent-background postprocessing received an invalid PNG filter");
        const source = packed.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        const row = raw.subarray(y * stride, (y + 1) * stride);
        const previous = y ? raw.subarray((y - 1) * stride, y * stride) : null;
        for (let x = 0; x < stride; x++) {
            const left = x >= channels ? row[x - channels] : 0;
            const up = previous?.[x] ?? 0;
            const upperLeft = previous && x >= channels ? previous[x - channels] : 0;
            const prediction = filter === 1 ? left : filter === 2 ? up : filter === 3 ?
                Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : 0;
            row[x] = (source[x] + prediction) & 255;
        }
    }
    const rgba = Buffer.alloc(pixelCount * 4);
    for (let pixel = 0; pixel < pixelCount; pixel++) {
        const source = pixel * channels;
        const target = pixel * 4;
        if (colorType === 0) {
            rgba[target] = rgba[target + 1] = rgba[target + 2] = raw[source];
            rgba[target + 3] = transparency?.length === 2 && transparency.readUInt16BE() === raw[source] ? 0 : 255;
        } else if (colorType === 2) {
            raw.copy(rgba, target, source, source + 3);
            rgba[target + 3] = transparency?.length === 6 &&
                transparency.readUInt16BE() === raw[source] &&
                transparency.readUInt16BE(2) === raw[source + 1] &&
                transparency.readUInt16BE(4) === raw[source + 2] ? 0 : 255;
        } else if (colorType === 3) {
            const index = raw[source];
            if (index * 3 + 2 >= palette.length) throw new Error("Transparent-background postprocessing received an invalid PNG palette index");
            palette.copy(rgba, target, index * 3, index * 3 + 3);
            rgba[target + 3] = transparency?.[index] ?? 255;
        } else if (colorType === 4) {
            rgba[target] = rgba[target + 1] = rgba[target + 2] = raw[source];
            rgba[target + 3] = raw[source + 1];
        } else {
            raw.copy(rgba, target, source, source + 4);
        }
    }
    return { width, height, rgba, colorChunks };
}

export function encodeRgbaPng(width, height, rgba, colorChunks = []) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
        !Buffer.isBuffer(rgba) || rgba.length !== width * height * 4) {
        throw new Error("RGBA pixels must match positive PNG dimensions");
    }
    if (!Array.isArray(colorChunks) || colorChunks.some(({ type, data } = {}) =>
        !COLOR_CHUNKS.has(type) || !Buffer.isBuffer(data))) {
        throw new Error("RGBA PNG color metadata must use supported PNG chunks");
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    const rows = Buffer.alloc(height * (width * 4 + 1));
    for (let y = 0; y < height; y++) rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    return Buffer.concat([
        SIGNATURE,
        chunk("IHDR", header),
        ...colorChunks.map(({ type, data }) => chunk(type, data)),
        chunk("IDAT", deflateSync(rows, { level: 9 })),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

export function removeBorderConnectedBackground(bytes, backgroundColor) {
    const normalized = normalizeBackgroundColor(backgroundColor);
    const target = [1, 3, 5].map((start) => Number.parseInt(normalized.slice(start, start + 2), 16));
    const { width, height, rgba, colorChunks } = decodePng(bytes);
    const count = width * height;
    const visited = new Uint8Array(count);
    const queue = new Uint32Array(count);
    let head = 0;
    let tail = 0;
    const matches = (pixel) => {
        const offset = pixel * 4;
        return rgba[offset + 3] === 255 &&
            Math.abs(rgba[offset] - target[0]) <= BACKGROUND_TOLERANCE &&
            Math.abs(rgba[offset + 1] - target[1]) <= BACKGROUND_TOLERANCE &&
            Math.abs(rgba[offset + 2] - target[2]) <= BACKGROUND_TOLERANCE;
    };
    const enqueue = (pixel) => {
        if (!visited[pixel] && matches(pixel)) {
            visited[pixel] = 1;
            queue[tail++] = pixel;
        }
    };
    for (let x = 0; x < width; x++) {
        enqueue(x);
        if (height > 1) enqueue((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y++) {
        enqueue(y * width);
        if (width > 1) enqueue(y * width + width - 1);
    }
    while (head < tail) {
        const pixel = queue[head++];
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        rgba[pixel * 4 + 3] = 0;
        if (x) enqueue(pixel - 1);
        if (x + 1 < width) enqueue(pixel + 1);
        if (y) enqueue(pixel - width);
        if (y + 1 < height) enqueue(pixel + width);
    }
    return {
        bytes: encodeRgbaPng(width, height, rgba, colorChunks),
        metadata: {
            operation: "border-connected-matte-to-alpha",
            backgroundColor: normalized,
            tolerance: BACKGROUND_TOLERANCE,
            removedPixels: tail,
            outputColorType: "rgba",
        },
    };
}
