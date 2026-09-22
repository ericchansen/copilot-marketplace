import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { crc32 } from "../lib/files.mjs";
import { exportRun, renderGallery } from "../lib/gallery.mjs";
import { startRun, reviewRun } from "../lib/workflow.mjs";
import { writeZip } from "../lib/zip.mjs";
import { config, offlineOptions } from "./helpers.mjs";

function workspace(t) {
    const root = mkdtempSync(join(tmpdir(), "foundry-gallery-test-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    return root;
}

function unzipStored(bytes) {
    const end = bytes.length - 22;
    assert.equal(bytes.readUInt32LE(end), 0x06054b50);
    const count = bytes.readUInt16LE(end + 10);
    let central = bytes.readUInt32LE(end + 16);
    const entries = new Map();
    for (let index = 0; index < count; index++) {
        assert.equal(bytes.readUInt32LE(central), 0x02014b50);
        assert.equal(bytes.readUInt16LE(central + 8), 0);
        assert.equal(bytes.readUInt16LE(central + 10), 0);
        assert.equal(bytes.readUInt16LE(central + 14), 33);
        const length = bytes.readUInt32LE(central + 24);
        const nameLength = bytes.readUInt16LE(central + 28);
        const name = bytes.toString("utf8", central + 46, central + 46 + nameLength);
        const local = bytes.readUInt32LE(central + 42);
        assert.equal(bytes.readUInt32LE(local), 0x04034b50);
        assert.equal(bytes.readUInt16LE(local + 6), 0);
        assert.equal(bytes.readUInt16LE(local + 8), 0);
        assert.equal(bytes.readUInt16LE(local + 12), 33);
        const start = local + 30 + bytes.readUInt16LE(local + 26);
        const value = bytes.subarray(start, start + length);
        assert.equal(crc32(value), bytes.readUInt32LE(central + 16));
        entries.set(name, value);
        central += 46 + nameLength;
    }
    assert.equal(central, end);
    return entries;
}

test("one-model multiple-image gallery and ZIP are complete portable offline artifacts", async (t) => {
    const root = workspace(t);
    const result = await startRun(["paper", "ink", "clay"].map((id) => ({
        id, args: { prompt: 'A garden sign reading "Welcome"', model: "gpt-image-2.5-sunburst" },
    })), root, config, offlineOptions());
    await reviewRun(result.run, root, "paper", "approved", { copyNotes: "Exact copy checked" });
    if (process.platform !== "win32") {
        const previous = process.umask(0o022);
        t.after(() => process.umask(previous));
    }
    const exported = await exportRun(result.run, root);
    if (process.platform !== "win32") assert.equal(statSync(exported.zip).mode & 0o777, 0o600);
    assert.ok(existsSync(exported.gallery));
    const html = readFileSync(exported.gallery, "utf8");
    assert.equal((html.match(/<article /g) ?? []).length, 3);
    assert.ok(html.includes("matched in 3 jobs"));
    assert.ok(html.includes('id="model"'));
    assert.ok(html.includes('id="review"'));
    assert.ok(html.includes("Exact copy checked"));
    assert.ok(html.includes("&quot;Welcome&quot;"));
    assert.ok(!html.includes(root));
    assert.ok(!html.includes("openai.example.test"));
    assert.ok(!html.includes("fixture-auth-token"));
    assert.ok(!/<(?:img|script)[^>]+src="https?:/.test(html));
    const entries = unzipStored(readFileSync(exported.zip));
    assert.deepEqual([...entries.keys()], ["assets/image-1.png", "assets/image-2.png", "assets/image-3.png", "index.html", "OPEN.txt"]);
    assert.deepEqual(entries.get("index.html"), Buffer.from(html));
    for (let index = 0; index < 3; index++) {
        assert.deepEqual(entries.get(`assets/image-${index + 1}.png`), readFileSync(result.jobs[index].image));
    }
    assert.ok(entries.get("OPEN.txt").toString().includes("Extract the entire ZIP"));
    const second = await exportRun(result.run, root);
    assert.notEqual(second.zip, exported.zip);
    assert.deepEqual(readdirSync(result.run).sort(), [
        "job-clay.png", "job-clay.received.json", "job-ink.png", "job-ink.received.json",
        "job-paper.png", "job-paper.received.json", "journal.json",
    ]);
});

test("portable rendering escapes user copy and excludes credential-like or local path text", () => {
    const job = {
        id: "test", state: "blocked", model: "gpt-image-2", prompt: '<img src=x onerror="alert(1)">',
        promptHash: "test-hash", review: { status: "revise", copyNotes: "<script>unsafe</script>" },
    };
    const html = renderGallery([job]);
    assert.ok(html.includes("&lt;img"));
    assert.ok(html.includes("&lt;script&gt;unsafe"));
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes("script-src 'sha256-"));
    assert.throws(() => renderGallery([{ ...job, prompt: "Open C:\\private\\image.png" }]), /machine-specific/);
    assert.throws(() => renderGallery([{ ...job, prompt: "Bearer placeholder-credential-value" }]), /credential-like/);
});

test("prompt-match counts preserve groups and use a linear number of hash reads", () => {
    let reads = 0;
    const jobs = Array.from({ length: 301 }, (_, index) => ({
        id: `job-${index}`, state: "blocked", model: "gpt-image-2", prompt: "A public garden",
        get promptHash() { reads++; return index === 300 ? "unique" : `group-${index % 3}`; },
        review: { status: "unreviewed" },
    }));
    const html = renderGallery(jobs);
    assert.equal((html.match(/<article /g) ?? []).length, jobs.length);
    assert.equal((html.match(/matched in 100 jobs/g) ?? []).length, 300);
    assert.equal((html.match(/<summary>Prompt and provenance<\/summary>/g) ?? []).length, 1);
    assert.ok(reads <= jobs.length * 6, `${reads} prompt-hash reads for ${jobs.length} jobs`);
});

test("ZIP rejects traversal and export keeps partial failures visible", async (t) => {
    const root = workspace(t);
    assert.throws(() => writeZip(join(root, "bad.zip"), [{ name: "../escape", path: "unused" }]), /relative names/);
    const result = await startRun([{ id: "blocked", args: { prompt: "Fixture block" } }], root, config, offlineOptions({
        fetchImpl: async () => new Response("safety filter", { status: 400 }),
    }));
    const exported = await exportRun(result.run, root);
    const html = readFileSync(exported.gallery, "utf8");
    assert.ok(html.includes("blocked"));
    assert.ok(!html.includes("<img "));
    assert.equal(unzipStored(readFileSync(exported.zip)).size, 2);
});
