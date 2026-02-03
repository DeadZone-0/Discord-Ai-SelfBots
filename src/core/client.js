const { Client } = require('discord.js-selfbot-v13');
const memoryManager = require('./memory');
const logger = require('../utils/logger');

class BotClient {
    constructor(token, geminiService, alwaysReply = true, useReplyFormat = false, replyDelay = { min: 1000, max: 2000 }, typingDelay = { min: 500, max: 3000 }, allowedDMs = [], allowedServers = [], autonomy = {}) {
        this.token = token;
        this.geminiService = geminiService;
        this.alwaysReply = alwaysReply;
        this.useReplyFormat = useReplyFormat;
        this.replyDelay = replyDelay;
        this.typingDelay = typingDelay;
        this.allowedDMs = allowedDMs;
        this.allowedServers = allowedServers;
        this.autonomy = autonomy;

        this.client = new Client({ checkUpdate: false });
        this.messageBuffer = new Map();
        this.bufferTimeout = 2500;

        this.client.on('ready', () => this.onReady());
        this.client.on('messageCreate', (msg) => this.onMessage(msg));
    }

    async login() {
        try {
            await this.client.login(this.token);
        } catch (error) {
            logger.error(`[${this.geminiService.character.name}] Login failed: ${error.message}`);
        }
    }

    onReady() {
        logger.info(`[${this.geminiService.character.name}] Online as ${this.client.user.tag}`);
        this.startBackgroundTasks();
    }

    startBackgroundTasks() {
        // Gossip processor - runs every 10 mins
        setInterval(async () => {
            const messages = memoryManager.getMessagesSince(10);
            if (messages.length > 0) {
                logger.debug(`[${this.geminiService.character.name}] Processing gossip...`);
                await this.geminiService.extractGossip(messages);
            }
        }, 10 * 60 * 1000);

        // User memory processor - runs every 10 mins (offset by 5)
        setTimeout(() => {
            setInterval(async () => {
                const messages = memoryManager.getMessagesSince(10);
                if (messages.length > 0) {
                    logger.debug(`[${this.geminiService.character.name}] Processing memories...`);
                    await this.geminiService.extractUserMemories(messages);
                }
            }, 10 * 60 * 1000);
        }, 5 * 60 * 1000);

        if (this.autonomy?.enabled) {
            this.startAutonomyLoop();
        }

        logger.info(`[${this.geminiService.character.name}] Background tasks started.`);
    }

    startAutonomyLoop() {
        const { intervalMinutes, targetChannels, chance } = this.autonomy;

        logger.info(`[${this.geminiService.character.name}] Autonomy enabled. Checking every ${intervalMinutes}m.`);

        setInterval(async () => {
            if (Math.random() > chance) return; // RNG check

            const channelId = targetChannels[Math.floor(Math.random() * targetChannels.length)];
            const channel = await this.client.channels.fetch(channelId).catch(() => null);

            if (!channel) return;

            // Only post if chat has been silent for a bit (don't interrupt)
            const recent = memoryManager.getRecent(channelId);
            const lastMsg = recent[recent.length - 1];
            if (lastMsg && (Date.now() - lastMsg.timestamp) < 5 * 60 * 1000) {
                // Chat is active, skip
                return;
            }

            logger.info(`[${this.geminiService.character.name}] Proactive check passed for ${channelId}`);

            const timeOfDay = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const message = await this.geminiService.generateProactiveMessage(timeOfDay);

            if (message) {
                await channel.send(message);
                memoryManager.addRecent(channelId, {
                    username: this.client.user.username,
                    content: message,
                    role: 'model',
                    id: 'proactive-' + Date.now()
                });
            }

        }, intervalMinutes * 60 * 1000);
    }

    async onMessage(message, forceReply = false) {
        if (message.author.id === this.client.user.id) return;

        // Whitelist checks
        const isDM = message.channel.type === 'DM' || message.channel.type === 'GROUP_DM';
        if (isDM && this.allowedDMs.length > 0 && !this.allowedDMs.includes(message.author.id)) return;
        if (!isDM && this.allowedServers.length > 0 && message.guild && !this.allowedServers.includes(message.guild.id)) return;

        const channelId = message.channel.id;

        // Save to temporary memory
        memoryManager.addRecent(channelId, {
            username: message.author.username,
            content: message.content,
            role: 'user',
            id: message.id
        });

        // Check reply conditions
        let shouldReply = false;
        if (isDM) shouldReply = true;
        if (message.mentions.users.has(this.client.user.id)) shouldReply = true;

        // Reply if referenced
        if (message.reference?.messageId) {
            try {
                const refMsg = await message.channel.messages.fetch(message.reference.messageId);
                if (refMsg.author.id === this.client.user.id) shouldReply = true;
            } catch (e) { }
        }

        if (shouldReply || forceReply) {
            // Ask AI if it wants to reply (if not forced)
            if (!this.alwaysReply && !forceReply) {
                const wantsToReply = await this.geminiService.shouldReply(
                    message.author.username,
                    message.content,
                    memoryManager.getRecent(channelId)
                );
                if (!wantsToReply) return; // AI ignored it
            }

            this.bufferMessage(message, channelId);
        }
    }

    bufferMessage(message, channelId) {
        if (this.messageBuffer.has(channelId)) {
            const buffer = this.messageBuffer.get(channelId);
            clearTimeout(buffer.timer);
            buffer.messages.push(message);
            buffer.timer = setTimeout(() => this.processBuffer(channelId), this.bufferTimeout);
        } else {
            this.messageBuffer.set(channelId, {
                messages: [message],
                timer: setTimeout(() => this.processBuffer(channelId), this.bufferTimeout)
            });

            // Fake typing
            const typingMs = this.typingDelay.min + Math.random() * (this.typingDelay.max - this.typingDelay.min);
            setTimeout(() => message.channel.sendTyping().catch(() => { }), typingMs);
        }
    }

    async processBuffer(channelId) {
        const buffer = this.messageBuffer.get(channelId);
        if (!buffer) return;

        this.messageBuffer.delete(channelId);
        const { messages } = buffer;
        const lastMsg = messages[messages.length - 1];

        logger.info(`Replying to ${messages.length} msg(s) in ${channelId}`);

        const history = memoryManager.getRecent(channelId);
        const isDM = lastMsg.channel.type === 'DM' || lastMsg.channel.type === 'GROUP_DM';

        const locationName = isDM
            ? (lastMsg.channel.type === 'GROUP_DM' ? lastMsg.channel.name || 'Group Chat' : 'DMs')
            : lastMsg.guild.name;

        const userNickname = isDM ? lastMsg.author.username : lastMsg.member?.displayName || lastMsg.author.username;

        const response = await this.geminiService.generateResponse(
            userNickname,
            lastMsg.author.username,
            lastMsg.author.id,
            history,
            locationName
        );

        if (!response) return;

        // Split long messages if needed
        const parts = response.split('[SPLIT]');

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim();
            if (!part) continue;

            try {
                if (this.useReplyFormat && i === 0) {
                    await lastMsg.reply(part);
                } else {
                    await lastMsg.channel.send(part);
                }
            } catch (err) {
                // Fallback
                try { await lastMsg.channel.send(part); } catch (e) { }
            }

            // Small delay between parts
            const delay = this.replyDelay.min + Math.random() * (this.replyDelay.max - this.replyDelay.min);
            await new Promise(r => setTimeout(r, delay));
        }

        memoryManager.addRecent(channelId, {
            username: this.client.user.username,
            content: response.replace(/\[SPLIT\]/g, ' '),
            role: 'model',
            id: 'generated-' + Date.now()
        });
    }
}

module.exports = BotClient;
