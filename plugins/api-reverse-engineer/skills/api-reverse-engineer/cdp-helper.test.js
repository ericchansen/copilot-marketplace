'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  CaptureTracker,
  captureRequest,
  parseArgs,
  redactHeaders,
  resolveConnection,
  sanitizeCapture,
  selectTarget,
  writeCapture,
} = require('./cdp-helper');

test('resolves a fixed-port endpoint to one exact page WebSocket', async () => {
  const connection = await resolveConnection(
    'http://127.0.0.1:9222',
    'https://app.example/items',
    async url => {
      assert.equal(url, 'http://127.0.0.1:9222/json/list');
      return [
        { type: 'page', url: 'https://other.example/', webSocketDebuggerUrl: 'ws://127.0.0.1/other' },
        { type: 'page', url: 'https://app.example/items', webSocketDebuggerUrl: 'ws://127.0.0.1/page' },
      ];
    },
  );
  assert.deepEqual(connection, { kind: 'page', wsUrl: 'ws://127.0.0.1/page' });
});

test('routes browser WebSockets through one flattened target session', async () => {
  const socket = new FakeWebSocket('ws://127.0.0.1:9222/devtools/browser/id');
  FakeWebSocket.instance = socket;
  const capture = await captureRequest({
    endpoint: socket.url,
    pageUrl: 'https://app.example/items',
    method: 'POST',
    requestUrl: 'https://app.example/api/items',
    waitMs: 20,
    captureResponseBody: true,
  }, { WebSocketImpl: FakeWebSocket });

  assert.equal(capture.responseBody.body, '{"ok":true}');
  const attach = socket.sent.find(message => message.method === 'Target.attachToTarget');
  assert.equal(attach.params.flatten, true);
  const enable = socket.sent.find(message => message.method === 'Network.enable');
  assert.equal(enable.sessionId, 'session-1');
  const getBody = socket.sent.find(message => message.method === 'Network.getResponseBody');
  assert.equal(getBody.sessionId, 'session-1');
});

test('matches only the exact request method and URL', async () => {
  const connection = { send: async () => ({}) };
  const tracker = new CaptureTracker({
    method: 'POST',
    requestUrl: 'https://app.example/api/items',
    captureResponseBody: false,
    connection,
  });
  tracker.handle(requestEvent('1', 'GET', 'https://app.example/api/items'));
  tracker.handle(requestEvent('2', 'POST', 'https://app.example/api/items?draft=1'));
  tracker.handle(requestEvent('3', 'POST', 'https://app.example/api/items'));
  assert.equal((await tracker.finish()).requestId, '3');
});

test('fails when exact request selection is ambiguous', async () => {
  const tracker = new CaptureTracker({
    method: 'POST',
    requestUrl: 'https://app.example/api/items',
    captureResponseBody: false,
    connection: { send: async () => ({}) },
  });
  tracker.handle(requestEvent('1', 'POST', 'https://app.example/api/items'));
  tracker.handle(requestEvent('2', 'POST', 'https://app.example/api/items'));
  await assert.rejects(() => tracker.finish(), /Ambiguous capture: 2 requests/);
});

test('fails when no exact request matches', async () => {
  const tracker = new CaptureTracker({
    method: 'POST',
    requestUrl: 'https://app.example/api/items',
    captureResponseBody: false,
    connection: { send: async () => ({}) },
  });
  await assert.rejects(() => tracker.finish(), /No request matched exact method POST/);
});

test('captures a response body after loading finishes', async () => {
  const calls = [];
  const tracker = new CaptureTracker({
    method: 'POST',
    requestUrl: 'https://app.example/api/items',
    captureResponseBody: true,
    sessionId: 'session-1',
    connection: {
      send: async (method, params, sessionId) => {
        calls.push({ method, params, sessionId });
        return { body: '{"token":"secret","value":1}', base64Encoded: false };
      },
    },
  });
  tracker.handle({ ...requestEvent('1', 'POST', 'https://app.example/api/items'), sessionId: 'session-1' });
  tracker.handle({ method: 'Network.loadingFinished', sessionId: 'session-1', params: { requestId: '1' } });
  const capture = await tracker.finish();
  assert.equal(capture.responseBody.base64Encoded, false);
  assert.deepEqual(calls, [{
    method: 'Network.getResponseBody',
    params: { requestId: '1' },
    sessionId: 'session-1',
  }]);
});

test('redacts credential headers and sensitive structured fields', () => {
  assert.deepEqual(redactHeaders({
    Authorization: 'example-auth-value',
    Cookie: 'sid=example-cookie',
    'Set-Cookie': 'sid=example-cookie',
    Accept: 'application/json',
  }), {
    Authorization: '<redacted>',
    Cookie: '<redacted>',
    'Set-Cookie': '<redacted>',
    Accept: 'application/json',
  });

  const capture = sanitizeCapture({
    request: {
      method: 'POST',
      url: 'https://app.example/api/items?token=example-value&view=full',
      headers: { Authorization: 'example-auth-value' },
      postData: '{"password":"example-value","name":"safe"}',
    },
    responseBody: {
      body: '{"accessToken":"example-value","value":1}',
      base64Encoded: false,
    },
  });
  assert.equal(capture.request.headers.Authorization, '<redacted>');
  assert.match(capture.request.url, /token=%3Credacted%3E/);
  assert.equal(capture.request.postData, '{"password":"<redacted>","name":"safe"}');
  assert.equal(capture.responseBody.body, '{"accessToken":"<redacted>","value":1}');
});

test('preserves ordinary text and redacts base64-encoded JSON bodies', () => {
  const capture = sanitizeCapture({
    request: {
      method: 'POST',
      url: 'https://app.example/api/items',
      headers: {},
      postData: 'plain text',
    },
    responseBody: {
      body: Buffer.from('{"token":"example-value","value":1}').toString('base64'),
      base64Encoded: true,
    },
  });
  assert.equal(capture.request.postData, 'plain text');
  assert.equal(
    Buffer.from(capture.responseBody.body, 'base64').toString('utf8'),
    '{"token":"<redacted>","value":1}',
  );
});

test('requires explicit CLI inputs and loopback CDP', () => {
  assert.deepEqual(parseArgs([
    '--endpoint', 'http://127.0.0.1:9222',
    '--method', 'post',
    '--url', 'https://app.example/api/items',
    '--response-body',
  ], {}), {
    endpoint: 'http://127.0.0.1:9222',
    pageUrl: undefined,
    method: 'POST',
    requestUrl: 'https://app.example/api/items',
    waitMs: 10000,
    outputDir: undefined,
    captureResponseBody: true,
  });
  assert.throws(() => parseArgs([
    '--endpoint', 'http://192.0.2.1:9222',
    '--method', 'POST',
    '--url', 'https://app.example/api/items',
  ], {}), /must use loopback/);
  assert.throws(() => parseArgs(['--unknown', 'value'], {}), /Unexpected argument/);
});

test('requires exact page selection when multiple targets exist', () => {
  assert.throws(() => selectTarget([
    { type: 'page', url: 'https://one.example/' },
    { type: 'page', url: 'https://two.example/' },
  ]), /Ambiguous page selection/);
});

test('writes only redacted credentials to the capture artifact', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-helper-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const outputPath = writeCapture({
    request: {
      method: 'POST',
      url: 'https://app.example/api/items?sessionToken=example-value',
      headers: { Authorization: 'example-auth-value', Cookie: 'sid=example-cookie' },
      postData: '{"apiKey":"example-value","value":1}',
    },
  }, directory);
  const output = fs.readFileSync(outputPath, 'utf8');
  assert.doesNotMatch(output, /example-auth-value|sid=example-cookie|example-value/);
  assert.match(output, /<redacted>/);
});

function requestEvent(requestId, method, url) {
  return {
    method: 'Network.requestWillBeSent',
    params: {
      requestId,
      request: { method, url, headers: {} },
    },
  };
}

class FakeWebSocket {
  static instance;

  constructor(url) {
    if (FakeWebSocket.instance) {
      const instance = FakeWebSocket.instance;
      FakeWebSocket.instance = undefined;
      queueMicrotask(() => instance.emit('open', {}));
      return instance;
    }
    this.url = url;
    this.sent = [];
    this.listeners = new Map();
    queueMicrotask(() => this.emit('open', {}));
  }

  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  send(text) {
    const message = JSON.parse(text);
    this.sent.push(message);
    if (message.method === 'Target.getTargets') {
      this.reply(message.id, {
        targetInfos: [{ type: 'page', targetId: 'target-1', url: 'https://app.example/items' }],
      });
    } else if (message.method === 'Target.attachToTarget') {
      this.reply(message.id, { sessionId: 'session-1' });
    } else if (message.method === 'Network.enable') {
      this.reply(message.id, {});
      setTimeout(() => {
        this.event({
          ...requestEvent('request-1', 'POST', 'https://app.example/api/items'),
          sessionId: 'session-1',
        });
        this.event({
          method: 'Network.responseReceived',
          sessionId: 'session-1',
          params: {
            requestId: 'request-1',
            response: { status: 200, statusText: 'OK', mimeType: 'application/json', headers: {} },
          },
        });
        this.event({
          method: 'Network.loadingFinished',
          sessionId: 'session-1',
          params: { requestId: 'request-1' },
        });
      }, 1);
    } else if (message.method === 'Network.getResponseBody') {
      this.reply(message.id, { body: '{"ok":true}', base64Encoded: false });
    }
  }

  reply(id, result) {
    queueMicrotask(() => this.emit('message', { data: JSON.stringify({ id, result }) }));
  }

  event(message) {
    this.emit('message', { data: JSON.stringify(message) });
  }

  emit(name, event) {
    for (const listener of this.listeners.get(name) ?? []) listener(event);
  }

  close() {}
}
