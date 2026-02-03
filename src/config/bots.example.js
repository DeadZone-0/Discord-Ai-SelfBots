module.exports = [
    {
        // Name in .env (e.g. DISCORD_TOKEN=...)
        token: process.env.DISCORD_TOKEN,

        // Character file
        character: require('../characters/example'),

        // Behavioral settings
        alwaysReply: true,
        useReplyFormat: true,

        // Delays to mimic human typing
        replyDelay: { min: 1000, max: 3000 },
        typingDelay: { min: 500, max: 2000 },

        // Safety: Whitelist only your servers/DMs
        allowedDMs: ['YOUR_USER_ID'],
        allowedServers: ['YOUR_SERVER_ID'],

        // Autonomy: Bot talks first?
        autonomy: {
            enabled: false,
            targetChannels: ['Target_Channel_ID'],
            intervalMinutes: 60,
            chance: 0.1
        }
    }
];
