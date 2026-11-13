'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');

const REDACTED = '<redacted>';
const SENSITIVE_HEADER = /^(authorization|cookie|proxy-authorization|set-cookie)$/i;
const SENSITIVE_FIELD = /^(?:sig|.*(?:authorization|cookie|credential|password|secret|session|token|api[-_]?key|signature).*)$/i;

function usage() {
  return `Usage:
  node cdp-helper.js --endpoint <http-or-ws-url> --method <METHOD> --url <exact-url> [options]

Options:
  --page-url <exact-url>   Required when endpoint exposes multiple pages or is a browser WebSocket
  --wait-ms <milliseconds> Capture window (default: 10000)
  --output-dir <path>      Protected output directory (default: a new temporary directory)
  --response-body          Capture the matching response body

Environment equivalents:
  CDP_ENDPOINT, CDP_PAGE_URL, CDP_METHOD, CDP_REQUEST_URL, CDP_WAIT_MS,
  CDP_OUTPUT_DIR, CDP_CAPTURE_RESPONSE_BODY=1`;
}

function parseArgs(argv, env = process.env) {
  const values = {};
  const valueOptions = new Set(['--endpoint', '--page-url', '--method', '--url', '--wait-ms', '--output-dir']);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--response-body') {
      values.responseBody = true;
      continue;
    }
    if (!valueOptions.has(arg)) throw new Error(`Unexpected argument: ${arg}`);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    values[arg.slice(2)] = value;
  }

  const waitMsText = values['wait-ms'] ?? env.CDP_WAIT_MS ?? '10000';
  const waitMs = Number(waitMsText);
  if (!Number.isInteger(waitMs) || waitMs < 1) {
    throw new Error(`--wait-ms must be a positive integer, got: ${waitMsText}`);
  }

  const options = {
    endpoint: values.endpoint ?? env.CDP_ENDPOINT,
    pageUrl: values['page-url'] ?? env.CDP_PAGE_URL,
    method: (values.method ?? env.CDP_METHOD)?.toUpperCase(),
    requestUrl: values.url ?? env.CDP_REQUEST_URL,
    waitMs,
    outputDir: values['output-dir'] ?? env.CDP_OUTPUT_DIR,
    captureResponseBody: values.responseBody ?? env.CDP_CAPTURE_RESPONSE_BODY === '1',
  };
  for (const [name, value] of [
    ['endpoint', options.endpoint],
    ['method', options.method],
    ['url', options.requestUrl],
  ]) {
    if (!value) throw new Error(`Missing required ${name}`);
  }
  assertLoopback(options.endpoint);
  return options;
}

function assertLoopback(value) {
  const url = new URL(value);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error(`CDP endpoint must use loopback, got: ${url.hostname}`);
  }
}

function httpGetJson(value) {
  return new Promise((resolve, reject) => {
    const url = new URL(value);
    const client = url.protocol === 'https:' ? https : http;
    const request = client.get(url, response => {
      let data = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`GET ${url} failed with HTTP ${response.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(new Error(`GET ${url} did not return JSON: ${error.message}`));
        }
      });
    });
    request.on('error', error => reject(new Error(`Cannot connect to ${url}: ${error.message}`)));
  });
}

function selectTarget(targets, pageUrl, label = 'page') {
  const pages = targets.filter(target => target.type === 'page' && target.url);
  const matches = pageUrl ? pages.filter(target => target.url === pageUrl) : pages;
  if (matches.length === 0) {
    throw new Error(`No ${label} matched the exact selection. Discovered ${pages.length} page target(s).`);
  }
  if (matches.length > 1) {
    throw new Error(`Ambiguous ${label} selection: ${matches.length} pages matched. Pass --page-url with an exact URL.`);
  }
  return matches[0];
}

async function resolveConnection(endpoint, pageUrl, getJson = httpGetJson) {
  const url = new URL(endpoint);
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    if (url.pathname.includes('/devtools/browser/')) return { kind: 'browser', wsUrl: endpoint };
    if (url.pathname.includes('/devtools/page/')) return { kind: 'page', wsUrl: endpoint };
    throw new Error('WebSocket endpoint must be a /devtools/browser/ or /devtools/page/ URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported CDP endpoint protocol: ${url.protocol}`);
  }

  const listUrl = new URL(url);
  if (!/^\/json(?:\/list)?\/?$/.test(listUrl.pathname)) {
    listUrl.pathname = '/json/list';
    listUrl.search = '';
    listUrl.hash = '';
  }
  const target = selectTarget(await getJson(listUrl.toString()), pageUrl, 'fixed-port page');
  if (!target.webSocketDebuggerUrl) throw new Error('Selected page did not expose webSocketDebuggerUrl');
  return { kind: 'page', wsUrl: target.webSocketDebuggerUrl };
}

class CdpConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Set();
    this.failure = new Promise((_, reject) => { this.rejectFailure = reject; });
    this.failure.catch(() => {});
    socket.addEventListener('message', event => this.handleMessage(event.data));
    socket.addEventListener('close', () => this.fail(new Error('CDP WebSocket closed')));
    socket.addEventListener('error', event => this.fail(
      new Error(`CDP WebSocket error: ${event.message ?? 'unknown error'}`),
    ));
  }

  handleMessage(data) {
    let message;
    try {
      message = JSON.parse(data);
    } catch (error) {
      for (const listener of this.listeners) listener({ method: 'Helper.parseError', params: { error } });
      return;
    }
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result ?? {});
      return;
    }
    for (const listener of this.listeners) listener(message);
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  fail(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
    this.rejectFailure(error);
  }

  waitForFailure() {
    return this.failure;
  }

  send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 20000);
      this.pending.set(id, { resolve, reject, timeout });
      const message = { id, method, params };
      if (sessionId) message.sessionId = sessionId;
      this.socket.send(JSON.stringify(message));
    });
  }
}

function openSocket(wsUrl, WebSocketImpl = globalThis.WebSocket, timeoutMs = 120000) {
  if (!WebSocketImpl) throw new Error('Native WebSocket is unavailable. Use Node.js 22.4 or newer.');
  return new Promise((resolve, reject) => {
    const socket = new WebSocketImpl(wsUrl);
    let settled = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.close();
      reject(error);
    };
    const timeout = setTimeout(() => {
      fail(new Error('CDP WebSocket open timed out; check the Edge approval prompt.'));
    }, timeoutMs);
    socket.addEventListener('open', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(socket);
    }, { once: true });
    socket.addEventListener('error', event => {
      fail(new Error(`CDP WebSocket failed to open: ${event.message ?? 'unknown error'}`));
    }, { once: true });
  });
}

class CaptureTracker {
  constructor({ method, requestUrl, captureResponseBody, connection, sessionId }) {
    this.method = method;
    this.requestUrl = requestUrl;
    this.captureResponseBody = captureResponseBody;
    this.connection = connection;
    this.sessionId = sessionId;
    this.matches = [];
    this.byRequestId = new Map();
    this.requestPromises = [];
    this.bodyPromises = [];
  }

  handle(message) {
    if (this.sessionId && message.sessionId !== this.sessionId) return;
    const { method, params = {} } = message;
    if (method === 'Network.requestWillBeSent') {
      const previous = this.byRequestId.get(params.requestId);
      if (previous && params.redirectResponse) {
        previous.response = responseMetadata(params.redirectResponse);
        previous.responseBodyError = 'response body is unavailable for a redirect response';
        this.byRequestId.delete(params.requestId);
      }
      const request = params.request;
      if (request?.method === this.method && request.url === this.requestUrl) {
        const capture = {
          requestId: params.requestId,
          request: {
            method: request.method,
            url: request.url,
            headers: request.headers ?? {},
            hasPostData: request.hasPostData ?? false,
            postData: request.postData,
          },
        };
        if (request.hasPostData && request.postData === undefined) {
          const postDataPromise = this.connection
            .send('Network.getRequestPostData', { requestId: params.requestId }, this.sessionId)
            .then(result => { capture.request.postData = result.postData; })
            .catch(error => { capture.requestPostDataError = error.message; });
          this.requestPromises.push(postDataPromise);
        }
        this.matches.push(capture);
        this.byRequestId.set(params.requestId, capture);
      }
      return;
    }
    const capture = this.byRequestId.get(params.requestId);
    if (!capture) return;
    if (method === 'Network.responseReceived') {
      capture.response = responseMetadata(params.response);
    }
    if (method === 'Network.loadingFinished' && this.captureResponseBody) {
      const bodyPromise = this.connection
        .send('Network.getResponseBody', { requestId: params.requestId }, this.sessionId)
        .then(body => { capture.responseBody = body; })
        .catch(error => { capture.responseBodyError = error.message; });
      this.bodyPromises.push(bodyPromise);
    }
  }

  async finish() {
    await Promise.all(this.requestPromises);
    await Promise.all(this.bodyPromises);
    if (this.matches.length === 0) {
      throw new Error(`No request matched exact method ${this.method}`);
    }
    if (this.matches.length > 1) {
      throw new Error(`Ambiguous capture: ${this.matches.length} requests matched exact method and URL`);
    }
    const capture = this.matches[0];
    if (capture.requestPostDataError) {
      throw new Error(`Request body capture failed: ${capture.requestPostDataError}`);
    }
    if (capture.request.postData === undefined && capture.request.hasPostData) {
      throw new Error('Request body capture failed: request data was unavailable');
    }
    if (this.captureResponseBody && !capture.responseBody) {
      throw new Error(`Response body capture failed: ${capture.responseBodyError ?? 'loading did not finish during the capture window'}`);
    }
    return capture;
  }
}

async function captureRequest(options, dependencies = {}) {
  const connectionInfo = await resolveConnection(
    options.endpoint,
    options.pageUrl,
    dependencies.getJson ?? httpGetJson,
  );
  const socket = await openSocket(connectionInfo.wsUrl, dependencies.WebSocketImpl);
  const connection = new CdpConnection(socket);
  let sessionId;

  try {
    if (connectionInfo.kind === 'browser') {
      const { targetInfos } = await connection.send('Target.getTargets');
      const target = selectTarget(targetInfos, options.pageUrl, 'browser target');
      ({ sessionId } = await connection.send('Target.attachToTarget', {
        targetId: target.targetId,
        flatten: true,
      }));
    }

    const tracker = new CaptureTracker({ ...options, connection, sessionId });
    const unsubscribe = connection.onEvent(message => tracker.handle(message));
    await connection.send('Network.enable', {}, sessionId);
    await Promise.race([
      new Promise(resolve => setTimeout(resolve, options.waitMs)),
      connection.waitForFailure(),
    ]);
    unsubscribe();
    return await tracker.finish();
  } finally {
    socket.close();
  }
}

function redactHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [
    name,
    SENSITIVE_HEADER.test(name) ? REDACTED : value,
  ]));
}

function redactObject(value) {
  if (Array.isArray(value)) return value.map(redactObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    SENSITIVE_FIELD.test(key) ? REDACTED : redactObject(child),
  ]));
}

function headerValue(headers, name) {
  const entry = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}

function mediaType(value) {
  return value?.split(';', 1)[0].trim().toLowerCase();
}

function redactBody(value, contentType, label) {
  if (typeof value !== 'string') return value;
  const type = mediaType(contentType);
  if (type === 'application/json' || type?.endsWith('+json')) {
    try {
      return JSON.stringify(redactObject(JSON.parse(value)));
    } catch (error) {
      throw new Error(`${label} is invalid JSON and cannot be redacted safely: ${error.message}`);
    }
  }
  if (type === 'application/x-www-form-urlencoded') {
    return value.split('&').map(part => {
      const separator = part.indexOf('=');
      const rawKey = separator === -1 ? part : part.slice(0, separator);
      let key;
      try {
        key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
      } catch (error) {
        throw new Error(`${label} contains an invalid form key: ${error.message}`);
      }
      if (!SENSITIVE_FIELD.test(key)) return part;
      return `${rawKey}=${encodeURIComponent(REDACTED)}`;
    }).join('&');
  }
  throw new Error(`${label} uses unsupported content type ${type || '(missing)'}`);
}

function redactUrl(value) {
  const url = new URL(value);
  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_FIELD.test(key)) url.searchParams.set(key, REDACTED);
  }
  return url.toString();
}

function sanitizeCapture(capture) {
  const requestContentType = headerValue(capture.request.headers, 'content-type');
  const sanitized = {
    request: {
      ...capture.request,
      url: redactUrl(capture.request.url),
      headers: redactHeaders(capture.request.headers),
      postData: capture.request.postData === undefined
        ? undefined
        : redactBody(capture.request.postData, requestContentType, 'Request body'),
    },
  };
  if (capture.response) {
    sanitized.response = {
      ...capture.response,
      headers: redactHeaders(capture.response.headers),
    };
  }
  if (capture.responseBody) {
    const responseType = capture.response?.mimeType ?? headerValue(capture.response?.headers, 'content-type');
    if (capture.responseBody.base64Encoded && !isTextualStructuredType(responseType)) {
      throw new Error(`Response body uses unsupported binary content type ${mediaType(responseType) || '(missing)'}`);
    }
    const decoded = capture.responseBody.base64Encoded
      ? Buffer.from(capture.responseBody.body, 'base64').toString('utf8')
      : capture.responseBody.body;
    const redacted = redactBody(decoded, responseType, 'Response body');
    sanitized.responseBody = {
      ...capture.responseBody,
      body: capture.responseBody.base64Encoded
        ? Buffer.from(redacted).toString('base64')
        : redacted,
    };
  }
  return sanitized;
}

function isTextualStructuredType(value) {
  const type = mediaType(value);
  return type === 'application/json'
    || type?.endsWith('+json')
    || type === 'application/x-www-form-urlencoded';
}

function responseMetadata(response) {
  return {
    status: response.status,
    statusText: response.statusText,
    mimeType: response.mimeType,
    headers: response.headers ?? {},
  };
}

function writeCapture(capture, outputDir) {
  const directory = outputDir
    ? path.resolve(outputDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-capture-'));
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(directory, 0o700);
  } catch (error) {
    console.warn(`Could not restrict output directory permissions: ${error.message}`);
  }
  const outputPath = path.join(directory, 'capture.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(sanitizeCapture(capture), null, 2)}\n`, { mode: 0o600 });
  return outputPath;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const capture = await captureRequest(options);
    const outputPath = writeCapture(capture, options.outputDir);
    console.log(`Captured exactly one ${options.method} request. Redacted output: ${outputPath}`);
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exitCode = 1;
  }
}

module.exports = {
  CaptureTracker,
  captureRequest,
  openSocket,
  parseArgs,
  redactHeaders,
  redactUrl,
  resolveConnection,
  sanitizeCapture,
  selectTarget,
  writeCapture,
};

if (require.main === module) main();
