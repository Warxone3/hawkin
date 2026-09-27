import { timingSafeEqual } from 'crypto';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { readFile } from 'fs/promises';
import path from 'path';
import QRCode from 'qrcode';
import { pairingPage } from './pairing-page';

type PairingRequest = {
    password?: unknown;
    phoneNumber?: unknown;
};

type RateLimit = {
    count: number;
    expiresAt: number;
};

const MAX_BODY_BYTES = 2048;
const MAX_REQUESTS = 20;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export class PairingServer {
    private readonly rateLimits = new Map<string, RateLimit>();
    private server?: Server;

    constructor(
        private readonly port: number,
        private readonly password: string,
        private readonly createPairingCode: (phoneNumber: string) => Promise<{ code: string; sessionId: string }>,
        private readonly createQrSession: () => Promise<{ qrToken: string; sessionId: string }>,
        private readonly getQrSession: (sessionId: string) => {
            status: 'waiting' | 'qr' | 'connected';
            qr?: string;
            sessionId?: string;
        } | undefined,
        private readonly getSessionStatus: (sessionId: string) => 'pending' | 'connected' | undefined,
    ) { }

    start(): void {
        this.server = createServer((request, response) => {
            void this.handleRequest(request, response).catch((error: unknown) => {
                console.error('Hawking Tech web request failed:', error);
                if (!response.headersSent) {
                    this.sendJson(response, 500, { error: 'The request could not be completed.' });
                }
            });
        });
        this.server.on('error', (error) => console.error('Hawking Tech web server failed:', error));
        this.server.listen(this.port, '0.0.0.0', () => {
            console.log(`Hawking Tech pairing page listening on port ${this.port}.`);
        });
    }

    private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
        const pathname = new URL(request.url || '/', 'http://localhost').pathname;
        if (request.method === 'GET' && pathname === '/health') {
            this.sendJson(response, 200, { status: 'ok' });
            return;
        }

        if (request.method === 'GET' && pathname === '/') {
            response.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
                'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
                'X-Content-Type-Options': 'nosniff',
                'Referrer-Policy': 'no-referrer',
                'X-Frame-Options': 'DENY',
            });
            response.end(pairingPage);
            return;
        }

        if (request.method === 'GET' && pathname === '/bot-avatar.svg') {
            const avatar = await readFile(path.join(process.cwd(), 'assets', 'bot-avatar.svg'));
            response.writeHead(200, {
                'Content-Type': 'image/svg+xml',
                'Cache-Control': 'public, max-age=86400',
                'X-Content-Type-Options': 'nosniff',
            });
            response.end(avatar);
            return;
        }

        if (request.method === 'POST' && pathname === '/api/pair') {
            await this.handlePairingRequest(request, response);
            return;
        }

        if (request.method === 'POST' && pathname === '/api/qr') {
            await this.handleQrSessionRequest(request, response);
            return;
        }

        const qrSessionId = pathname.match(/^\/api\/qr\/([a-f0-9]{64})$/)?.[1];
        if (request.method === 'GET' && qrSessionId) {
            await this.handleQrStatusRequest(qrSessionId, response);
            return;
        }

        const sessionId = pathname.match(/^\/api\/session\/([a-f0-9-]{36})$/i)?.[1];
        if (request.method === 'GET' && sessionId) {
            const status = this.getSessionStatus(sessionId);
            this.sendJson(response, status ? 200 : 404, status
                ? { sessionId, status }
                : { error: 'Session not found or expired.' });
            return;
        }

        response.writeHead(404, { 'Cache-Control': 'no-store' });
        response.end('Not found');
    }

    private async handlePairingRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
        const payload = await this.readAuthorizedPayload(request, response);
        if (!payload) return;

        if (typeof payload.phoneNumber !== 'string') {
            this.sendJson(response, 400, { error: 'Enter the WhatsApp number with its country code.' });
            return;
        }

        const phoneNumber = payload.phoneNumber.replace(/\D/g, '');
        if (!/^[1-9]\d{7,14}$/.test(phoneNumber)) {
            this.sendJson(response, 400, { error: 'Enter a valid international number with its country code.' });
            return;
        }

        try {
            const result = await this.createPairingCode(phoneNumber);
            this.sendJson(response, 200, { ...result, status: 'pending' });
        } catch (error) {
            console.error('Could not generate a WhatsApp pairing code:', error);
            const message = error instanceof Error ? error.message : '';
            const details = error as {
                output?: { payload?: { error?: string } };
            };
            const wasRejectedByWhatsApp = message === 'Connection Closed'
                || details.output?.payload?.error === 'Precondition Required';
            const publicErrors = new Set([
                'This number already has a linked session.',
                'The maximum of 10 WhatsApp accounts has been reached.',
            ]);
            this.sendJson(response, 409, {
                error: publicErrors.has(message)
                    ? message
                    : wasRejectedByWhatsApp
                        ? 'WhatsApp rejected this pairing request. Confirm this number is active on WhatsApp, open WhatsApp on that phone, and remove any stale Hawking entry under Linked devices before retrying.'
                        : 'Could not generate a code. Check that the bot is connected and try again.',
            });
        }
    }

    private async handleQrSessionRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
        if (!await this.readAuthorizedPayload(request, response)) return;

        try {
            const session = await this.createQrSession();
            this.sendJson(response, 202, { qrToken: session.qrToken, status: 'waiting' });
        } catch (error) {
            console.error('Could not start a WhatsApp QR session:', error);
            const message = error instanceof Error ? error.message : '';
            this.sendJson(response, 409, {
                error: message === 'The maximum of 10 WhatsApp accounts has been reached.'
                    ? message
                    : 'Could not start a QR session. Check the bot connection and try again.',
            });
        }
    }

    private async handleQrStatusRequest(sessionId: string, response: ServerResponse): Promise<void> {
        const session = this.getQrSession(sessionId);
        if (!session) {
            this.sendJson(response, 404, { error: 'This QR session expired. Start a new one.' });
            return;
        }

        if (session.status !== 'qr' || !session.qr) {
            this.sendJson(response, 200, { status: session.status, sessionId: session.sessionId });
            return;
        }

        const image = await QRCode.toDataURL(session.qr, {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 320,
        });
        this.sendJson(response, 200, { status: 'qr', image });
    }

    private async readAuthorizedPayload(
        request: IncomingMessage,
        response: ServerResponse,
    ): Promise<PairingRequest | undefined> {
        if (!this.password || this.password.length < 10) {
            this.sendJson(response, 503, { error: 'Pairing is disabled until the owner configures a page password of at least 10 characters.' });
            return undefined;
        }

        const origin = request.headers.origin;
        if (origin && request.headers.host && new URL(origin).host !== request.headers.host) {
            this.sendJson(response, 403, { error: 'Cross-origin pairing requests are not allowed.' });
            return undefined;
        }

        const clientIp = request.socket.remoteAddress || 'unknown';
        if (!this.allowRequest(clientIp)) {
            this.sendJson(response, 429, { error: 'Too many requests. Try again later.' });
            return undefined;
        }

        if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
            this.sendJson(response, 415, { error: 'Send the pairing details as JSON.' });
            return undefined;
        }

        let payload: PairingRequest;
        try {
            payload = await this.readJson(request);
        } catch {
            this.sendJson(response, 400, { error: 'The request body must be valid JSON under 2 KB.' });
            return undefined;
        }

        if (typeof payload.password !== 'string' || !this.passwordMatches(payload.password)) {
            this.sendJson(response, 401, { error: 'The pairing page password is incorrect.' });
            return undefined;
        }

        return payload;
    }

    private async readJson(request: IncomingMessage): Promise<PairingRequest> {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of request) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += buffer.length;
            if (size > MAX_BODY_BYTES) throw new Error('Request body too large.');
            chunks.push(buffer);
        }
        return JSON.parse(Buffer.concat(chunks).toString('utf8')) as PairingRequest;
    }

    private passwordMatches(candidate: string): boolean {
        const expected = Buffer.from(this.password);
        const supplied = Buffer.from(candidate);
        return expected.length === supplied.length && timingSafeEqual(expected, supplied);
    }

    private allowRequest(clientIp: string): boolean {
        const now = Date.now();
        let limit = this.rateLimits.get(clientIp);
        if (!limit || limit.expiresAt <= now) {
            limit = { count: 0, expiresAt: now + RATE_LIMIT_WINDOW_MS };
            this.rateLimits.set(clientIp, limit);
        }
        if (limit.count >= MAX_REQUESTS) return false;
        limit.count += 1;
        return true;
    }

    private sendJson(response: ServerResponse, status: number, body: object): void {
        response.writeHead(status, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
        });
        response.end(JSON.stringify(body));
    }
}