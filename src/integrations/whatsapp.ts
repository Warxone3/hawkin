import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import {
    Browsers,
    DisconnectReason,
    downloadMediaMessage,
    getContentType,
    makeWASocket,
    useMultiFileAuthState,
    WAMessage,
    WASocket,
} from '@whiskeysockets/baileys';
import { AIIntegration } from './ai';
import { NewsIntegration } from './news';
import { TriviaIntegration } from './trivia';

type MediaPayload = {
    caption?: string;
    fileName?: string;
    mimetype?: string;
};

const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;

export class WhatsAppIntegration {
    private socket?: WASocket;
    private reconnectTimer?: NodeJS.Timeout;
    private hasRegisteredSession = false;
    private stopping = false;
    private qrHandler?: (qr: string) => void;

    constructor(
        private readonly pairingNumber: string,
        private ownerNumber: string,
        private readonly ai: AIIntegration,
        private readonly news: NewsIntegration,
        private readonly trivia: TriviaIntegration,
        private readonly authDirectory = 'auth_info_baileys',
        private readonly downloadDirectory = 'downloads',
        private readonly sessionId = '',
    ) { }

    async start(pairingPhoneNumber?: string, customPairingCode?: string): Promise<string | undefined> {
        this.stopping = false;
        const { state, saveCreds } = await useMultiFileAuthState(this.authDirectory);
        this.hasRegisteredSession = state.creds.registered;
        const socket = makeWASocket({
            auth: state,
            browser: Browsers.ubuntu('WhatsApp Bot'),
        });
        this.socket = socket;

        socket.ev.on('creds.update', saveCreds);
        socket.ev.on('creds.update', () => {
            this.hasRegisteredSession = state.creds.registered;
            const linkedNumber = state.creds.me?.id.split('@')[0].split(':')[0];
            if (linkedNumber) this.ownerNumber = linkedNumber;
        });
        socket.ev.on('messages.upsert', ({ messages, type }) => {
            if (type !== 'notify') return;

            for (const message of messages) {
                void this.handleMessage(socket, message).catch((error: unknown) => {
                    console.error('WhatsApp message handling failed:', error);
                });
            }
        });
        socket.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
            if (qr) this.qrHandler?.(qr);

            if (connection === 'open') {
                console.log('WhatsApp connected.');
            }

            if (connection === 'close') {
                const statusCode = (lastDisconnect?.error as {
                    output?: { statusCode?: number };
                } | undefined)?.output?.statusCode;

                if (statusCode === DisconnectReason.loggedOut) {
                    console.error('WhatsApp logged out. Remove the auth folder and pair again.');
                } else if (!this.stopping && !this.reconnectTimer) {
                    this.reconnectTimer = setTimeout(() => {
                        this.reconnectTimer = undefined;
                        void this.start().catch(console.error);
                    }, 3000);
                }
            }
        });

        if (!state.creds.registered) {
            const number = (pairingPhoneNumber ?? this.pairingNumber).replace(/\D/g, '');
            if (number) {
                const code = await this.requestPairingCode(number, customPairingCode);
                if (this.pairingNumber) {
                    console.log(`WhatsApp pairing code: ${code}`);
                    console.log('Enter this code on the phone in WhatsApp > Linked devices > Link with phone number.');
                } else {
                    return code;
                }
            } else {
                console.log('WhatsApp is waiting for a pairing request from the Hawking Tech page.');
            }
        }
        return undefined;
    }

    async requestPairingCode(phoneNumber: string, customPairingCode?: string): Promise<string> {
        if (!this.socket) throw new Error('WhatsApp is still starting. Try again shortly.');
        if (this.hasRegisteredSession) throw new Error('This bot already has a linked WhatsApp account.');

        const number = phoneNumber.replace(/\D/g, '');
        if (!/^[1-9]\d{7,14}$/.test(number)) {
            throw new Error('Enter a valid international phone number including its country code.');
        }

        return this.socket.requestPairingCode(number, customPairingCode);
    }

    isRegistered(): boolean {
        return this.hasRegisteredSession;
    }

    getOwnerNumber(): string {
        return this.ownerNumber.replace(/\D/g, '');
    }

    getSessionId(): string {
        return this.sessionId;
    }

    onQr(handler: (qr: string) => void): void {
        this.qrHandler = handler;
    }

    async stop(): Promise<void> {
        this.stopping = true;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
        this.socket?.end(new Error('WhatsApp session stopped.'));
        this.socket = undefined;
    }

    async sendMessage(to: string, text: string): Promise<void> {
        if (!this.socket) throw new Error('WhatsApp is not connected.');
        await this.socket.sendMessage(to, { text });
    }

    private async handleMessage(socket: WASocket, message: WAMessage): Promise<void> {
        const remoteJid = message.key.remoteJid;
        const body = message.message;
        if (!remoteJid || !body) return;

        await socket.readMessages([message.key]);

        const contentType = getContentType(body);
        const payload = contentType
            ? (body as unknown as Record<string, MediaPayload>)[contentType]
            : undefined;
        const content = body as unknown as {
            conversation?: string;
            extendedTextMessage?: { text?: string };
            viewOnceMessage?: unknown;
            viewOnceMessageV2?: unknown;
            viewOnceMessageV2Extension?: unknown;
        };
        const text = content.conversation ?? content.extendedTextMessage?.text ?? payload?.caption ?? '';
        const [command, ...args] = text.trim().split(/\s+/);
        if (!command?.startsWith('!')) return;

        const sender = message.key.participant ?? remoteJid;
        const normalizedCommand = command.toLowerCase();
        const publicCommands = new Set(['!help', '!trivia', '!answer', '!score', '!news']);
        if (!publicCommands.has(normalizedCommand) && !message.key.fromMe && !this.isOwner(sender)) {
            await socket.sendMessage(remoteJid, { text: 'This command is restricted to the bot owner.' });
            return;
        }

        try {
            switch (normalizedCommand) {
                case '!help':
                    await socket.sendMessage(remoteJid, {
                        text: [
                            'HAWKING TECH - WhatsApp assistant',
                            'Public commands (available to everyone in this chat):',
                            '!trivia - start a multiple-choice quiz for this chat.',
                            '!answer <1-4> - submit your answer; the first correct answer earns a point.',
                            '!score - show the top scores for this chat. Scores reset when the bot restarts.',
                            '!news - get up to five current BBC World headlines and links.',
                            'Owner-only commands:',
                            '!ai <question> - ask the AI assistant (requires the owner to configure an OpenAI API key).',
                            '!save - save an attached image, video, audio file, or document. Put !save in the media caption; maximum 100 MB.',
                            '!join <invite link> - join a group from its invite link.',
                            '!add <country-code-and-number> - add a member to this group.',
                            '!kick <country-code-and-number> - remove a member from this group.',
                            '!link - get this group’s invite link.',
                            '!session - show the linked account’s session reference (owner only; not a login credential).',
                            'The bot marks incoming messages as read. It never opens or saves view-once media.',
                            'Pairing uses WhatsApp Linked devices. Session data is saved automatically on the server; never share QR codes or pairing codes.',
                        ].join('\n'),
                    });
                    break;
                case '!save':
                    await this.saveMedia(socket, message, remoteJid, content, contentType, payload);
                    break;
                case '!ai': {
                    const prompt = args.join(' ').trim();
                    if (!prompt || prompt.length > 4000) {
                        await socket.sendMessage(remoteJid, {
                            text: 'Usage: !ai <question> (maximum 4,000 characters)',
                        });
                        break;
                    }
                    const answer = await this.ai.answer(prompt);
                    await socket.sendMessage(remoteJid, { text: answer });
                    break;
                }
                case '!trivia':
                    await socket.sendMessage(remoteJid, { text: await this.trivia.start(remoteJid) });
                    break;
                case '!answer':
                    await socket.sendMessage(remoteJid, {
                        text: this.trivia.answer(remoteJid, sender, args.join(' ')),
                    });
                    break;
                case '!score':
                    await socket.sendMessage(remoteJid, { text: this.trivia.leaderboard(remoteJid) });
                    break;
                case '!news':
                    await socket.sendMessage(remoteJid, { text: await this.news.headlines() });
                    break;
                case '!join': {
                    const invite = args.join(' ').match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/i)?.[1];
                    if (!invite) {
                        await socket.sendMessage(remoteJid, { text: 'Usage: !join <WhatsApp group invite link>' });
                        break;
                    }
                    const groupJid = await socket.groupAcceptInvite(invite);
                    await socket.sendMessage(remoteJid, { text: `Joined group ${groupJid}.` });
                    break;
                }
                case '!add':
                case '!kick':
                    await this.updateParticipant(socket, remoteJid, command.toLowerCase(), args[0]);
                    break;
                case '!link': {
                    if (!remoteJid.endsWith('@g.us')) {
                        await socket.sendMessage(remoteJid, { text: 'Use !link in a group.' });
                        break;
                    }
                    const invite = await socket.groupInviteCode(remoteJid);
                    await socket.sendMessage(remoteJid, {
                        text: `https://chat.whatsapp.com/${invite}`,
                    });
                    break;
                }
                case '!session':
                    await socket.sendMessage(remoteJid, {
                        text: this.isRegistered()
                            ? `Session ID: ${this.sessionId}\nThis ID is only a reference; never use it as a password or pairing code.`
                            : 'This WhatsApp account is not linked yet.',
                    });
                    break;
                default:
                    await socket.sendMessage(remoteJid, { text: 'Unknown command. Send !help for commands.' });
            }
        } catch (error) {
            console.error(`WhatsApp command ${command} failed:`, error);
            await socket.sendMessage(remoteJid, {
                text: normalizedCommand === '!ai'
                    ? 'The AI request failed. Check OPENAI_API_KEY, OPENAI_MODEL, and the API account.'
                    : normalizedCommand === '!news'
                        ? 'Could not fetch the news right now. Please try again shortly.'
                        : normalizedCommand === '!trivia'
                            ? 'Could not load a trivia question right now. Please try again shortly.'
                            : 'That action failed. Check that the bot is an admin if this is a group command.',
            });
        }
    }

    private async saveMedia(
        socket: WASocket,
        message: WAMessage,
        remoteJid: string,
        content: {
            viewOnceMessage?: unknown;
            viewOnceMessageV2?: unknown;
            viewOnceMessageV2Extension?: unknown;
        },
        contentType: string | undefined,
        payload: MediaPayload | undefined,
    ): Promise<void> {
        if (content.viewOnceMessage || content.viewOnceMessageV2 || content.viewOnceMessageV2Extension) {
            await socket.sendMessage(remoteJid, { text: 'View-once media is not downloaded.' });
            return;
        }

        if (!contentType || !['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'].includes(contentType)) {
            await socket.sendMessage(remoteJid, {
                text: 'Attach !save as the caption to an image, video, audio, or document.',
            });
            return;
        }

        const media = await downloadMediaMessage(message, 'buffer', {});
        if (media.length > MAX_DOWNLOAD_BYTES) {
            await socket.sendMessage(remoteJid, { text: 'That file exceeds the 100 MB download limit.' });
            return;
        }

        const suppliedExtension = payload?.fileName ? path.extname(payload.fileName) : '';
        const mimeExtension = payload?.mimetype?.split('/')[1]?.split(';')[0];
        const extension = suppliedExtension || (mimeExtension ? `.${mimeExtension.replace(/[^a-zA-Z0-9]/g, '')}` : '');
        await mkdir(this.downloadDirectory, { recursive: true });
        const filename = `${Date.now()}-${randomUUID()}${extension}`;
        await writeFile(path.join(this.downloadDirectory, filename), media, { flag: 'wx' });
        await socket.sendMessage(remoteJid, { text: `Saved ${filename} to ${this.downloadDirectory}.` });
    }

    private async updateParticipant(
        socket: WASocket,
        remoteJid: string,
        command: string,
        number?: string,
    ): Promise<void> {
        if (!remoteJid.endsWith('@g.us')) {
            await socket.sendMessage(remoteJid, { text: `Use ${command} in a group.` });
            return;
        }

        const normalizedNumber = number?.replace(/\D/g, '');
        if (!normalizedNumber || normalizedNumber.length < 8 || normalizedNumber.length > 15) {
            await socket.sendMessage(remoteJid, { text: `Usage: ${command} <international number>` });
            return;
        }

        const action = command === '!add' ? 'add' : 'remove';
        await socket.groupParticipantsUpdate(remoteJid, [`${normalizedNumber}@s.whatsapp.net`], action);
        await socket.sendMessage(remoteJid, { text: `Member ${action} request sent.` });
    }

    private isOwner(jid: string): boolean {
        const owner = this.ownerNumber.replace(/\D/g, '');
        const sender = jid.split('@')[0].replace(/\D/g, '');
        return Boolean(owner && sender === owner);
    }
}