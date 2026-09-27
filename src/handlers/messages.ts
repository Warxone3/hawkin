import { Message } from '../types';
import { DiscordIntegration } from '../integrations/discord';
import { WhatsAppIntegration } from '../integrations/whatsapp';

export function handleMessage(message: Message) {
    switch (message.source) {
        case 'discord':
            const discordIntegration = new DiscordIntegration();
            discordIntegration.handleDiscordMessage(message);
            break;
        case 'whatsapp':
            const whatsappIntegration = new WhatsAppIntegration();
            whatsappIntegration.handleWhatsAppMessage(message);
            break;
        default:
            console.error('Unknown message source:', message.source);
    }
}