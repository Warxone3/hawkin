import dotenv from 'dotenv';

dotenv.config();

const config = {
    name: process.env.BOT_NAME || 'Hawking',
    discord: {
        token: process.env.DISCORD_TOKEN,
        prefix: process.env.DISCORD_PREFIX || '!',
    },
    whatsapp: {
        pairingNumber: process.env.WHATSAPP_PAIRING_NUMBER || '',
        ownerNumber: process.env.WHATSAPP_OWNER_NUMBER || process.env.WHATSAPP_PAIRING_NUMBER || '',
    },
    ai: {
        openAiApiKey: process.env.OPENAI_API_KEY || '',
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    },
    server: {
        port: Number(process.env.PORT || 3000),
        pairingPagePassword: process.env.PAIRING_PAGE_PASSWORD || '',
    },
};

export default config;