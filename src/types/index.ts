export interface Message {
    id: string;
    content: string;
    senderId: string;
    timestamp: Date;
    platform: 'whatsapp' | 'discord';
}

export interface User {
    id: string;
    name: string;
    platform: 'whatsapp' | 'discord';
}

export interface BotConfig {
    discordToken: string;
    whatsappToken: string;
    port: number;
}