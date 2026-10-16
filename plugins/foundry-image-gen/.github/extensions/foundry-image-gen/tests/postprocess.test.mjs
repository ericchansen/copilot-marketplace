import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import test from "node:test";
import { crc32 } from "../lib/files.mjs";
import { decodePng, removeBorderConnectedBackground } from "../lib/postprocess.mjs";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type, data) {
    const name = Buffer.from(type);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([length, name, data, checksum]);
}

function fixture({ width, height, colorType, rows, palette, transparency, colorChunks = [] }) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = colorType;
    return Buffer.concat([
        SIGNATURE,
        chunk("IHDR", header),
        ...colorChunks.map(([type, data]) => chunk(type, data)),
        ...(palette ? [chunk("PLTE", palette)] : []),
        ...(transparency ? [chunk("tRNS", transparency)] : []),
        chunk("IDAT", deflateSync(Buffer.from(rows))),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

function listedChunks(bytes) {
    const chunks = [];
    for (let offset = 8; offset < bytes.length;) {
        const length = bytes.readUInt32BE(offset);
        const type = bytes.toString("ascii", offset + 4, offset + 8);
        chunks.push([type, Buffer.from(bytes.subarray(offset + 8, offset + 8 + length))]);
        offset += length + 12;
    }
    return chunks;
}

test("decodes every PNG filter at first-row and first-column boundaries", () => {
    const expected = Buffer.from([
        10, 20, 30, 40, 50, 60, 70, 80,
        15, 25, 35, 45, 55, 65, 75, 85,
    ]);
    const filteredRows = [
        [
            0, 10, 20, 30, 40, 50, 60, 70, 80,
            0, 15, 25, 35, 45, 55, 65, 75, 85,
        ],
        [
            1, 10, 20, 30, 40, 40, 40, 40, 40,
            1, 15, 25, 35, 45, 40, 40, 40, 40,
        ],
        [
            2, 10, 20, 30, 40, 50, 60, 70, 80,
            2, 5, 5, 5, 5, 5, 5, 5, 5,
        ],
        [
            3, 10, 20, 30, 40, 45, 50, 55, 60,
            3, 10, 15, 20, 25, 23, 23, 23, 23,
        ],
        [
            4, 10, 20, 30, 40, 40, 40, 40, 40,
            4, 5, 5, 5, 5, 5, 5, 5, 5,
        ],
    ];
    for (const rows of filteredRows) {
        assert.deepEqual(decodePng(fixture({ width: 2, height: 2, colorType: 6, rows })).rgba, expected);
    }
});

test("decodes supported color types and transparency into known RGBA bytes", () => {
    const cases = [
        {
            colorType: 0,
            rows: [0, 10, 20],
            transparency: Buffer.from([0, 20]),
            expected: [10, 10, 10, 255, 20, 20, 20, 0],
        },
        {
            colorType: 2,
            rows: [0, 1, 2, 3, 4, 5, 6],
            transparency: Buffer.from([0, 4, 0, 5, 0, 6]),
            expected: [1, 2, 3, 255, 4, 5, 6, 0],
        },
        {
            colorType: 3,
            rows: [0, 0, 1],
            palette: Buffer.from([9, 8, 7, 6, 5, 4]),
            transparency: Buffer.from([255, 73]),
            expected: [9, 8, 7, 255, 6, 5, 4, 73],
        },
        {
            colorType: 4,
            rows: [0, 10, 77, 20, 128],
            expected: [10, 10, 10, 77, 20, 20, 20, 128],
        },
        {
            colorType: 6,
            rows: [0, 1, 2, 3, 4, 5, 6, 7, 8],
            expected: [1, 2, 3, 4, 5, 6, 7, 8],
        },
    ];
    for (const item of cases) {
        assert.deepEqual(decodePng(fixture({
            width: 2,
            height: 1,
            ...item,
        })).rgba, Buffer.from(item.expected));
    }
});

test("bounds dimensions and decompression before allocating decoded pixels", () => {
    assert.throws(() => decodePng(fixture({
        width: 8_294_401,
        height: 1,
        colorType: 0,
        rows: [0],
    })), /at most 8,294,400 pixels/);
    assert.throws(() => decodePng(fixture({
        width: 1,
        height: 1,
        colorType: 0,
        rows: Array(1024).fill(0),
    })), /invalid or oversized PNG scanlines/);
});

test("preserves compatible PNG color metadata while changing only alpha", () => {
    const gamma = Buffer.from([0, 0, 177, 143]);
    const chromaticities = Buffer.from(Array.from({ length: 32 }, (_, index) => index));
    const profile = Buffer.concat([Buffer.from("fixture-profile\0\0"), deflateSync(Buffer.from("fixture ICC data"))]);
    const source = fixture({
        width: 2,
        height: 1,
        colorType: 2,
        rows: [0, 255, 247, 238, 1, 2, 3],
        colorChunks: [["gAMA", gamma], ["cHRM", chromaticities], ["iCCP", profile]],
    });
    const result = removeBorderConnectedBackground(source, "#FFF7EE");
    const preserved = listedChunks(result.bytes).filter(([type]) => ["gAMA", "cHRM", "iCCP"].includes(type));
    assert.deepEqual(preserved, [["gAMA", gamma], ["cHRM", chromaticities], ["iCCP", profile]]);
    assert.deepEqual(decodePng(result.bytes).rgba, Buffer.from([255, 247, 238, 0, 1, 2, 3, 255]));
});
