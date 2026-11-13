'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  CaptureTracker,
  captureRequest,
  openSocket,
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
  await assert.rejects(
    () => tracker.finish(),
    error => error.message === 'No request matched exact method POST'
      && !error.message.includes('https://app.example/api/items'),
  );
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
      headers: { Authorization: 'example-auth-value', 'Content-Type': 'application/json' },
      postData: '{"password":"example-value","name":"safe"}',
    },
    response: { mimeType: 'application/json', headers: {} },
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

test('redacts base64-encoded JSON bodies without changing the encoding', () => {
  const capture = sanitizeCapture({
    request: {
      method: 'POST',
      url: 'https://app.example/api/items',
      headers: { 'Content-Type': 'application/json' },
      postData: '{"value":1}',
    },
    response: { mimeType: 'application/json', headers: {} },
    responseBody: {
      body: Buffer.from('{"token":"example-value","value":1}').toString('base64'),
      base64Encoded: true,
    },
  });
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

test('target selection errors do not disclose page URLs', () => {
  assert.throws(
    () => selectTarget([
      { type: 'page', url: 'https://app.example/?code=private-value' },
    ], 'https://missing.example/'),
    error => error.message === 'No page matched the exact selection. Discovered 1 page target(s).'
      && !error.message.includes('private-value')
      && !error.message.includes('missing.example'),
  );
});

test('redacts Azure SAS sig parameters', () => {
  const capture = sanitizeCapture({
    request: {
      method: 'GET',
      url: 'https://account.blob.core.windows.net/container/file?sv=1&sig=private-value',
      headers: {},
    },
  });
  assert.doesNotMatch(capture.request.url, /private-value/);
  assert.match(capture.request.url, /sig=%3Credacted%3E/);
});

test('retrieves omitted request post data before completing capture', async () => {
  const calls = [];
  const tracker = new CaptureTracker({
    method: 'POST',
    requestUrl: 'https://app.example/api/items',
    captureResponseBody: false,
    connection: {
      send: async (method, params) => {
        calls.push({ method, params });
        return { postData: '{"value":1}' };
      },
    },
  });
  tracker.handle(requestEvent('1', 'POST', 'https://app.example/api/items', {
    hasPostData: true,
    headers: { 'Content-Type': 'application/json' },
  }));
  const capture = await tracker.finish();
  assert.equal(capture.request.postData, '{"value":1}');
  assert.deepEqual(calls, [{
    method: 'Network.getRequestPostData',
    params: { requestId: '1' },
  }]);
});

test('fails when omitted request post data cannot be retrieved', async () => {
  const tracker = new CaptureTracker({
    method: 'POST',
    requestUrl: 'https://app.example/api/items',
    captureResponseBody: false,
    connection: { send: async () => { throw new Error('body unavailable'); } },
  });
  tracker.handle(requestEvent('1', 'POST', 'https://app.example/api/items', { hasPostData: true }));
  await assert.rejects(() => tracker.finish(), /Request body capture failed: body unavailable/);
});

test('does not associate a redirect target response with the captured request', async () => {
  const tracker = new CaptureTracker({
    method: 'POST',
    requestUrl: 'https://app.example/api/items',
    captureResponseBody: true,
    connection: { send: async () => ({ body: 'wrong', base64Encoded: false }) },
  });
  tracker.handle(requestEvent('1', 'POST', 'https://app.example/api/items'));
  tracker.handle(requestEvent('1', 'GET', 'https://login.example/', {
    redirectResponse: {
      status: 302,
      statusText: 'Found',
      mimeType: 'text/html',
      headers: { Location: 'https://login.example/' },
    },
  }));
  tracker.handle({
    method: 'Network.responseReceived',
    params: {
      requestId: '1',
      response: { status: 200, statusText: 'OK', mimeType: 'text/html', headers: {} },
    },
  });
  await assert.rejects(
    () => tracker.finish(),
    /Response body capture failed: response body is unavailable for a redirect response/,
  );
});

test('rejects unsupported request formats instead of rewriting them', () => {
  assert.throws(() => sanitizeCapture({
    request: {
      method: 'POST',
      url: 'https://app.example/api/items',
      headers: { 'Content-Type': 'application/xml' },
      postData: '<value>a=b</value>',
    },
  }), /Request body uses unsupported content type application\/xml/);
});

test('redacts form secrets without re-encoding nonsecret fields', () => {
  const capture = sanitizeCapture({
    request: {
      method: 'POST',
      url: 'https://app.example/api/items',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      postData: 'name=first%20last&token=private-value&note=a%2Bb',
    },
  });
  assert.equal(
    capture.request.postData,
    'name=first%20last&token=%3Credacted%3E&note=a%2Bb',
  );
});

test('rejects binary response bodies instead of corrupting their bytes', () => {
  assert.throws(() => sanitizeCapture({
    request: { method: 'GET', url: 'https://app.example/file', headers: {} },
    response: { mimeType: 'application/pdf', headers: {} },
    responseBody: {
      body: Buffer.from([0xff, 0x00, 0xfe]).toString('base64'),
      base64Encoded: true,
    },
  }), /unsupported binary content type application\/pdf/);
});

test('closes a pending socket when the open handshake times out', async () => {
  const socket = new NeverOpenWebSocket();
  NeverOpenWebSocket.instance = socket;
  await assert.rejects(
    () => openSocket('ws://127.0.0.1/devtools/browser/id', NeverOpenWebSocket, 5),
    /open timed out/,
  );
  assert.equal(socket.closed, true);
});

test('fails capture when the socket closes during the observation window', async () => {
  const socket = new FakeWebSocket('ws://127.0.0.1:9222/devtools/browser/id');
  socket.closeDuringCapture = true;
  FakeWebSocket.instance = socket;
  await assert.rejects(() => captureRequest({
    endpoint: socket.url,
    pageUrl: 'https://app.example/items',
    method: 'POST',
    requestUrl: 'https://app.example/api/items',
    waitMs: 20,
    captureResponseBody: false,
  }, { WebSocketImpl: FakeWebSocket }), /CDP WebSocket closed/);
});

test('writes only redacted credentials to the capture artifact', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-helper-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const outputPath = writeCapture({
    request: {
      method: 'POST',
      url: 'https://app.example/api/items?sessionToken=example-value',
      headers: {
        Authorization: 'example-auth-value',
        Cookie: 'sid=example-cookie',
        'Content-Type': 'application/json',
      },
      postData: '{"apiKey":"example-value","value":1}',
    },
  }, directory);
  const output = fs.readFileSync(outputPath, 'utf8');
  assert.doesNotMatch(output, /example-auth-value|sid=example-cookie|example-value/);
  assert.match(output, /<redacted>/);
});

function requestEvent(requestId, method, url, options = {}) {
  return {
    method: 'Network.requestWillBeSent',
    params: {
      requestId,
      redirectResponse: options.redirectResponse,
      request: {
        method,
        url,
        headers: options.headers ?? {},
        hasPostData: options.hasPostData,
        postData: options.postData,
      },
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
      if (this.closeDuringCapture) {
        setTimeout(() => this.emit('close', {}), 1);
        return;
      }
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

  close() {
    this.closed = true;
  }
}

class NeverOpenWebSocket {
  static instance;

  constructor() {
    const instance = NeverOpenWebSocket.instance;
    NeverOpenWebSocket.instance = undefined;
    return instance;
  }

  constructorState() {}

  addEventListener() {}

  close() {
    this.closed = true;
  }
}
