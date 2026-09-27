import { randomBytes, randomUUID } from 'crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import { AIIntegration } from './ai';
import { NewsIntegration } from './news';
import { TriviaIntegration } from './trivia';
import { WhatsAppIntegration } from './whatsapp';

const MAX_SESSIONS = 10;
const PENDING_SESSION_TTL_MS = 10 * 60 * 1000;
const PAIRING_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

type Session = {
    authDirectory: string;
    integration: WhatsAppIntegration;
    sessionId: string;
    removeOnExpiry: boolean;
    started: boolean;
    qr?: string;
};

type SessionManagerOptions = {
    authDirectory: string;
    downloadDirectory: string;
    legacyOwnerNumber: string;
    pairingNumber: string;
    openAiApiKey: string;
    openAiModel: string;
};

export class WhatsAppSessionManager {
    private readonly sessions = new Map<string, Session>();
    private readonly pendingTimers = new Map<string, NodeJS.Timeout>();

    constructor(private readonly options: SessionManagerOptions) { }

    async start(): Promise<void> {
        await mkdir(this.options.authDirectory, { recursive: true });
        const entries = await readdir(this.options.authDirectory, { withFileTypes: true });
        const hasLegacyCredentials = entries.some((entry) => entry.isFile() && entry.name === 'creds.json');

        if (hasLegacyCredentials) {
            const legacyNumber = this.normalizeNumber(
                this.options.legacyOwnerNumber || this.options.pairingNumber,
            );
            if (legacyNumber) {
                await this.restoreSession(legacyNumber, this.options.authDirectory, false);
            } else {
                console.error('Found an old WhatsApp session but no owner number is configured to restore it.');
            }
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const authDirectory = path.join(this.options.authDirectory, entry.name);

            if (/^[1-9]\d{7,14}$/.test(entry.name)) {
                if (this.sessions.has(entry.name)) continue;
                if (this.sessions.size >= MAX_SESSIONS) {
                    console.error(`Only ${MAX_SESSIONS} WhatsApp sessions can run; extra saved sessions were not started.`);
                    break;
                }
                await this.restoreSession(entry.name, authDirectory);
                continue;
            }

            if (!entry.name.startsWith('qr-')) continue;
            const { state } = await useMultiFileAuthState(authDirectory);
            const number = this.normalizeNumber(state.creds.me?.id.split('@')[0].split(':')[0] || '');
            if (state.creds.registered && /^[1-9]\d{7,14}$/.test(number) && !this.sessions.has(number)) {
                if (this.sessions.size >= MAX_SESSIONS) break;
                await this.restoreSession(number, authDirectory, false);
            } else if (!state.creds.registered) {
                await rm(authDirectory, { recursive: true, force: true });
            }
        }

        const pairingNumber = this.normalizeNumber(this.options.pairingNumber);
        const configuredSession = pairingNumber ? this.sessions.get(pairingNumber) : undefined;
        if (pairingNumber && !configuredSession?.integration.isRegistered()) {
            try {
                const { code } = await this.createPairingCode(pairingNumber);
                console.log(`WhatsApp pairing code: ${code}`);
                console.log('Enter this code on the phone in WhatsApp > Linked devices > Link with phone number.');
            } catch (error) {
                console.error('Could not create the configured WhatsApp pairing code:', error);
            }
        }
    }

    async createPairingCode(phoneNumber: string): Promise<{ code: string; sessionId: string }> {
        const number = this.normalizeNumber(phoneNumber);
        if (!/^[1-9]\d{7,14}$/.test(number)) {
            throw new Error('Enter a valid international phone number including its country code.');
        }

        const existing = this.sessions.get(number) ?? [...this.sessions.values()].find(
            (session) => session.integration.isRegistered() && session.integration.getOwnerNumber() === number,
        );
        if (existing) {
            if (existing.integration.isRegistered()) {
                throw new Error('This number already has a linked session.');
            }
            const pairingCode = this.generatePairingCode();
            const code = existing.started
                ? await existing.integration.requestPairingCode(number, pairingCode)
                : await existing.integration.start(number, pairingCode);
            if (!code) throw new Error('Could not create a WhatsApp pairing code.');
            existing.started = true;
            this.schedulePendingCleanup(number, existing);
            return { code, sessionId: existing.sessionId };
        }

        if (this.sessions.size >= MAX_SESSIONS) {
            throw new Error(`The maximum of ${MAX_SESSIONS} WhatsApp accounts has been reached.`);
        }

        const session = await this.createSession(number, path.join(this.options.authDirectory, number));
        this.sessions.set(number, session);
        try {
            const code = await session.integration.start(number, this.generatePairingCode());
            if (!code) throw new Error('Could not create a WhatsApp pairing code.');
            session.started = true;
            this.schedulePendingCleanup(number, session);
            return { code, sessionId: session.sessionId };
        } catch (error) {
            this.sessions.delete(number);
            await session.integration.stop();
            await rm(session.authDirectory, { recursive: true, force: true });
            throw error;
        }
    }

    async createQrSession(): Promise<{ qrToken: string; sessionId: string }> {
        if (this.sessions.size >= MAX_SESSIONS) {
            throw new Error(`The maximum of ${MAX_SESSIONS} WhatsApp accounts has been reached.`);
        }

        const sessionId = randomBytes(32).toString('hex');
        const sessionKey = `qr-${sessionId}`;
        const session = await this.createSession('', path.join(this.options.authDirectory, sessionKey));
        session.integration.onQr((qr) => {
            session.qr = qr;
        });
        this.sessions.set(sessionKey, session);

        try {
            await session.integration.start();
            session.started = true;
            this.schedulePendingCleanup(sessionKey, session);
            return { qrToken: sessionId, sessionId: session.sessionId };
        } catch (error) {
            this.sessions.delete(sessionKey);
            await session.integration.stop();
            await rm(session.authDirectory, { recursive: true, force: true });
            throw error;
        }
    }

    getQrSession(sessionId: string): {
        status: 'waiting' | 'qr' | 'connected';
        qr?: string;
        sessionId?: string;
    } | undefined {
        const session = this.sessions.get(`qr-${sessionId}`);
        if (!session) return undefined;
        if (session.integration.isRegistered()) {
            return { status: 'connected', sessionId: session.sessionId };
        }
        return session.qr ? { status: 'qr', qr: session.qr } : { status: 'waiting' };
    }

    getSessionIdForOwner(phoneNumber: string): string | undefined {
        const number = this.normalizeNumber(phoneNumber);
        return [...this.sessions.values()].find(
            (session) => session.integration.isRegistered() && session.integration.getOwnerNumber() === number,
        )?.sessionId;
    }

    private async restoreSession(
        phoneNumber: string,
        authDirectory: string,
        removeOnExpiry = true,
    ): Promise<void> {
        if (this.sessions.size >= MAX_SESSIONS) return;
        const session = await this.createSession(phoneNumber, authDirectory, removeOnExpiry);
        this.sessions.set(phoneNumber, session);
        try {
            const { state } = await useMultiFileAuthState(authDirectory);
            if (state.creds.registered) {
                await session.integration.start();
                session.started = true;
            } else {
                this.schedulePendingCleanup(phoneNumber, session);
            }
        } catch (error) {
            this.sessions.delete(phoneNumber);
            await session.integration.stop();
            console.error(`Could not restore WhatsApp session for ${phoneNumber}:`, error);
        }
    }

    private async createSession(
        phoneNumber: string,
        authDirectory: string,
        removeOnExpiry = true,
    ): Promise<Session> {
        await mkdir(authDirectory, { recursive: true });
        const sessionIdPath = path.join(authDirectory, 'session-id');
        let sessionId: string;
        try {
            sessionId = (await readFile(sessionIdPath, 'utf8')).trim();
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            sessionId = randomUUID();
            await writeFile(sessionIdPath, `${sessionId}\n`, { flag: 'wx' });
        }

        if (!/^[0-9a-f-]{36}$/i.test(sessionId)) {
            throw new Error('Saved session ID is invalid.');
        }

        return {
            authDirectory,
            sessionId,
            removeOnExpiry,
            started: false,
            integration: new WhatsAppIntegration(
                '',
                phoneNumber,
                new AIIntegration(this.options.openAiApiKey, this.options.openAiModel),
                new NewsIntegration(),
                new TriviaIntegration(),
                authDirectory,
                path.join(this.options.downloadDirectory, phoneNumber),
                sessionId,
            ),
        };
    }

    private schedulePendingCleanup(phoneNumber: string, session: Session): void {
        if (!session.removeOnExpiry) return;
        const existingTimer = this.pendingTimers.get(phoneNumber);
        if (existingTimer) clearTimeout(existingTimer);

        const timer = setTimeout(() => {
            this.pendingTimers.delete(phoneNumber);
            if (session.integration.isRegistered() || this.sessions.get(phoneNumber) !== session) return;

            this.sessions.delete(phoneNumber);
            void session.integration.stop();
            void rm(session.authDirectory, { recursive: true, force: true });
        }, PENDING_SESSION_TTL_MS);
        timer.unref();
        this.pendingTimers.set(phoneNumber, timer);
    }

    private normalizeNumber(value: string): string {
        return value.replace(/\D/g, '');
    }

    private generatePairingCode(): string {
        return Array.from(randomBytes(8), (byte) => PAIRING_ALPHABET[byte & 31]).join('');
    }
}