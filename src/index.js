require('dotenv').config();
const logger = require('./utils/logger');
const BotClient = require('./core/client');
const GeminiService = require('./core/gemini');
const memoryManager = require('./core/memory');
const botConfigs = require('./config/bots');
const readline = require('readline');

async function main() {
    // 1. Initialize Database
    try {
        await memoryManager.init();
    } catch (err) {
        logger.error(`Critical: Database failed to start. ${err.message}`);
        process.exit(1);
    }

    // 2. Start Bots
    const bots = [];

    for (const config of botConfigs) {
        if (!config.token) {
            logger.warn(`Skipping ${config.character.name} - No Token`);
            continue;
        }

        try {
            const geminiService = new GeminiService(config.character);
            const bot = new BotClient(
                config.token,
                geminiService,
                config.alwaysReply,
                config.useReplyFormat,
                config.replyDelay,
                config.typingDelay,
                config.allowedDMs,
                config.allowedServers,
                config.autonomy
            );

            await bot.login();
            bots.push(bot);
            logger.info(`Started: ${config.character.name}`);
        } catch (error) {
            logger.error(`Failed to start ${config.character.name}: ${error.message}`);
        }
    }

    if (bots.length === 0) {
        logger.error('No bots started. Check config/bots.js');
        process.exit(1);
    }

    logger.info(`System ready. ${bots.length} active bot(s).`);

    // 3. CLI Interface
    setupConsole(bots);
}

function setupConsole(bots) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.on('line', async (line) => {
        const [command, ...args] = line.trim().split(/\s+/);

        if (command === 'trigger') {
            const [channelId, messageId, ...botNameParts] = args;
            const botName = botNameParts.join(' ').toLowerCase();

            if (!channelId || !messageId) {
                console.log('Usage: trigger <channelId> <messageId> [botName]');
                return;
            }

            const targets = botName
                ? bots.filter(b => b.geminiService.character.name.toLowerCase().includes(botName))
                : bots;

            if (targets.length === 0) {
                console.log('No matching bots found.');
                return;
            }

            console.log(`Triggering ${targets.length} bot(s)...`);

            for (const bot of targets) {
                try {
                    const channel = await bot.client.channels.fetch(channelId);
                    if (!channel) continue;

                    const message = await channel.messages.fetch(messageId);
                    if (!message) {
                        console.log(`Message not found for ${bot.geminiService.character.name}`);
                        continue;
                    }

                    console.log(`Processing with ${bot.geminiService.character.name}...`);
                    await bot.onMessage(message, true); // Force reply
                } catch (error) {
                    console.error(`Error (${bot.geminiService.character.name}): ${error.message}`);
                }
            }
        }
    });
}

main();
