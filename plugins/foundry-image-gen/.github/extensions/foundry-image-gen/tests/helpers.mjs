import { deflateSync } from "node:zlib";
import { crc32 } from "../lib/files.mjs";
import { getConfig } from "../lib/providers.mjs";

export const config = getConfig({
    FOUNDRY_IMAGE_ENDPOINT: "https://openai.example.test",
    FOUNDRY_IMAGE_SERVICES_ENDPOINT: "https://services.example.test",
    FOUNDRY_IMAGE_SUNBURST_DEPLOYMENT: "art-sunburst",
});

export function png(width = 3, height = 2, color = [36, 91, 143]) {
    function chunk(name, bytes) {
        const type = Buffer.from(name);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(bytes.length);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(Buffer.concat([type, bytes])));
        return Buffer.concat([size, type, bytes, crc]);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 2;
    const rows = Buffer.alloc(height * (width * 3 + 1));
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const stripe = x > width / 2 && y > height / 3 ? 1.3 : 1;
            for (let channel = 0; channel < 3; channel++) {
                rows[y * (width * 3 + 1) + x * 3 + channel + 1] = Math.min(255, color[channel] * stripe);
            }
        }
    }
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
        chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0)),
    ]);
}

export const imageResponse = (bytes = png()) => new Response(JSON.stringify({
    data: [{ b64_json: bytes.toString("base64") }], usage: { total_tokens: 42, input_tokens_details: { image_tokens: 5 } },
    model_version: "fixture-version",
}), { headers: { "x-request-id": "fixture-request" } });

export function offlineOptions(overrides = {}) {
    let clock = 1_800_000_000_000;
    return {
        tokenProvider: () => "fixture-auth-token",
        fetchImpl: async () => imageResponse(),
        now: () => clock,
        sleepImpl: async (milliseconds) => { clock += milliseconds; },
        ...overrides,
    };
}
