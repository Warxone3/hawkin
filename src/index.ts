import { createInterface } from 'readline/promises';
import config from './config';
import { WhatsAppSessionManager } from './integrations/whatsapp-session-manager';
import { PairingServer } from './web/pairing-server';

const sessions = new WhatsAppSessionManager({
    authDirectory: 'auth_info_baileys',
    downloadDirectory: 'downloads',
    legacyOwnerNumber: config.whatsapp.ownerNumber,
    pairingNumber: process.argv.includes('--pair') ? '' : config.whatsapp.pairingNumber,
    openAiApiKey: config.ai.openAiApiKey,
    openAiModel: config.ai.model,
});
const pairingServer = new PairingServer(
    config.server.port,
    config.server.pairingPagePassword,
    (phoneNumber) => sessions.createPairingCode(phoneNumber),
    () => sessions.createQrSession(),
    (sessionId) => sessions.getQrSession(sessionId),
    (sessionId) => sessions.getSessionStatus(sessionId),
);

async function pairFromTerminal(): Promise<void> {
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try {
        while (true) {
            const phoneNumber = await terminal.question(
                'WhatsApp number with country code (blank to finish): ',
            );
            if (!phoneNumber.trim()) break;

            try {
                const { code, sessionId } = await sessions.createPairingCode(phoneNumber);
                console.log(`Pairing code: ${code}`);
                console.log('On that phone, open WhatsApp > Linked devices > Link with phone number.');
                console.log(`Session reference (not a login credential): ${sessionId}`);
            } catch (error) {
                console.error(error instanceof Error ? error.message : 'Could not start pairing.');
            }

            const addAnother = await terminal.question('Pair another WhatsApp number? (y/N): ');
            if (addAnother.trim().toLowerCase() !== 'y') break;
        }
    } finally {
        terminal.close();
    }
}

void sessions.start()
    .then(async () => {
        if (process.argv.includes('--pair')) await pairFromTerminal();
        pairingServer.start();
    })
    .catch((error: unknown) => {
        console.error('Could not start Hawking Tech:', error);
        process.exitCode = 1;
    });