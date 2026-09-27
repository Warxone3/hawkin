import config from './config';
import { WhatsAppSessionManager } from './integrations/whatsapp-session-manager';
import { PairingServer } from './web/pairing-server';

const sessions = new WhatsAppSessionManager({
    authDirectory: 'auth_info_baileys',
    downloadDirectory: 'downloads',
    legacyOwnerNumber: config.whatsapp.ownerNumber,
    pairingNumber: config.whatsapp.pairingNumber,
    openAiApiKey: config.ai.openAiApiKey,
    openAiModel: config.ai.model,
});
const pairingServer = new PairingServer(
    config.server.port,
    config.server.pairingPagePassword,
    (phoneNumber) => sessions.createPairingCode(phoneNumber),
    () => sessions.createQrSession(),
    (sessionId) => sessions.getQrSession(sessionId),
);

void sessions.start().then(() => pairingServer.start()).catch((error: unknown) => {
    console.error('Could not start Hawking Tech:', error);
    process.exitCode = 1;
});