import { closeSync, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";
import { crc32 } from "./files.mjs";

const DOS_EPOCH_DATE = 33; // 1980-01-01, not general-purpose flags.

// PNGs are already compressed. A stored ZIP needs only standard headers and CRCs.
export function writeZip(path, entries) {
    if (entries.length > 65_535) throw new Error("Export exceeds the portable ZIP entry limit");
    const fd = openSync(path, "wx", 0o600);
    const directory = [];
    let offset = 0;
    const write = (bytes) => {
        let sent = 0;
        while (sent < bytes.length) sent += writeSync(fd, bytes, sent, bytes.length - sent);
        offset += bytes.length;
    };
    try {
        for (const entry of entries) {
            if (!/^(?:assets\/)?[a-zA-Z0-9_.-]+$/.test(entry.name) || entry.name.includes("..")) {
                throw new Error("ZIP entries must have safe relative names");
            }
            const name = Buffer.from(entry.name);
            const data = readFileSync(entry.path);
            if (offset + data.length + name.length + 30 > 0xffffffff) throw new Error("Export exceeds 4 GiB; split the requested delivery");
            const crc = crc32(data);
            const header = Buffer.alloc(30);
            header.writeUInt32LE(0x04034b50);
            header.writeUInt16LE(20, 4);
            header.writeUInt16LE(DOS_EPOCH_DATE, 12);
            header.writeUInt32LE(crc, 14);
            header.writeUInt32LE(data.length, 18);
            header.writeUInt32LE(data.length, 22);
            header.writeUInt16LE(name.length, 26);
            const central = Buffer.alloc(46);
            central.writeUInt32LE(0x02014b50);
            central.writeUInt16LE(20, 4);
            central.writeUInt16LE(20, 6);
            central.writeUInt16LE(DOS_EPOCH_DATE, 14);
            central.writeUInt32LE(crc, 16);
            central.writeUInt32LE(data.length, 20);
            central.writeUInt32LE(data.length, 24);
            central.writeUInt16LE(name.length, 28);
            central.writeUInt32LE(offset, 42);
            directory.push(central, name);
            write(header);
            write(name);
            write(data);
        }
        const directoryOffset = offset;
        for (const bytes of directory) write(bytes);
        const end = Buffer.alloc(22);
        end.writeUInt32LE(0x06054b50);
        end.writeUInt16LE(entries.length, 8);
        end.writeUInt16LE(entries.length, 10);
        end.writeUInt32LE(offset - directoryOffset, 12);
        end.writeUInt32LE(directoryOffset, 16);
        write(end);
        fsyncSync(fd);
    } finally {
        closeSync(fd);
    }
}
