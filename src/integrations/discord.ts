class DiscordIntegration {
    constructor(token) {
        this.token = token;
        this.client = new (require('discord.js')).Client();
    }

    initialize() {
        this.client.login(this.token);
        this.client.on('ready', () => {
            console.log(`Logged in as ${this.client.user.tag}!`);
        });
    }

    sendMessage(channelId, message) {
        const channel = this.client.channels.cache.get(channelId);
        if (channel) {
            channel.send(message);
        } else {
            console.error('Channel not found');
        }
    }

    onMessage(callback) {
        this.client.on('message', (message) => {
            if (!message.author.bot) {
                callback(message);
            }
        });
    }

    // Additional methods for handling events and managing channels can be added here
} 

module.exports = DiscordIntegration;