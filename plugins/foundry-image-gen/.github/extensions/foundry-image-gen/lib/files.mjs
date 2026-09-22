import { createHash, randomUUID } from "node:crypto";
import {
    closeSync, existsSync, fsyncSync, mkdirSync, mkdtempSync, openSync, readFileSync,
    realpathSync, renameSync, statSync, unlinkSync, writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { isPathInside } from "./references.mjs";

function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
    }
    return value;
}

export function hash(value) {
    return createHash("sha256").update(
        Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(stable(value))
    ).digest("hex");
}

export function safeName(name) {
    return basename(name).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "generated-image";
}

export function containedPath(root, name) {
    if (typeof name !== "string" || !name.trim()) throw new Error("A local workspace path is required");
    const realRoot = realpathSync(root);
    const candidate = resolve(root, name);
    if (!isPathInside(resolve(root), candidate) && !isPathInside(realRoot, candidate)) {
        throw new Error("Path escapes the workspace");
    }
    const real = realpathSync(candidate);
    if (!isPathInside(realRoot, real)) throw new Error("Path escapes the workspace through a symlink");
    return real;
}

export function readJson(root, name) {
    const file = containedPath(root, name);
    if (!statSync(file).isFile()) throw new Error("Expected a local JSON file");
    try {
        return JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
        throw new Error(`Cannot read JSON: ${error.message}`);
    }
}

export function atomicJson(file, value) {
    const temp = `${file}.${randomUUID()}.tmp`;
    const fd = openSync(temp, "wx", 0o600);
    try {
        writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`);
        fsyncSync(fd);
    } finally {
        closeSync(fd);
    }
    try {
        renameSync(temp, file);
    } finally {
        if (existsSync(temp)) unlinkSync(temp);
    }
}

export function createOutputDir(workspace, prefix) {
    const files = join(workspace, "files");
    if (!existsSync(files)) mkdirSync(files);
    const root = containedPath(workspace, files);
    return mkdtempSync(join(root, `${safeName(prefix)}-`));
}

export async function withRunLock(runDir, action) {
    const path = join(runDir, ".lock");
    const lock = { pid: process.pid, owner: randomUUID() };
    try {
        writeFileSync(path, JSON.stringify(lock), { flag: "wx", mode: 0o600 });
    } catch (error) {
        if (error.code !== "EEXIST") throw error;
        throw new Error("This run is locked. Do not submit it again. If its previous process has stopped, remove only this run's .lock file, then resume.");
    }
    try {
        return await action();
    } finally {
        const current = readJson(runDir, ".lock");
        if (current.owner !== lock.owner) throw new Error("Run lock changed unexpectedly; inspect the journal before resuming");
        unlinkSync(path);
    }
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
});

export function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

export function pngDimensions(bytes) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (bytes.length < 45 || !bytes.subarray(0, 8).equals(signature) ||
        bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii", 12, 16) !== "IHDR") {
        throw new Error("Provider output is not a complete PNG");
    }
    let offset = 8;
    let imageData = false;
    while (offset + 12 <= bytes.length) {
        const size = bytes.readUInt32BE(offset);
        const end = offset + 12 + size;
        if (end > bytes.length ||
            crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) {
            throw new Error("PNG is truncated or has an invalid checksum");
        }
        const type = bytes.toString("ascii", offset + 4, offset + 8);
        if (type === "IDAT") imageData = true;
        if (type === "IEND" && size === 0 && end === bytes.length && imageData) {
            const width = bytes.readUInt32BE(16);
            const height = bytes.readUInt32BE(20);
            if (width > 0 && height > 0) return { width, height };
        }
        offset = end;
    }
    throw new Error("PNG is missing image data or its end marker");
}
