const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const memoryManager = require('./memory');
const logger = require('../utils/logger');
const prompts = require('./prompts');
require('dotenv').config();

class GeminiService {
    constructor(character) {
        this.character = character;
        this.apiKeys = this.loadApiKeys();

        if (this.apiKeys.length === 0) {
            logger.warn('No GEMINI_API_KEY found in .env');
            this.apiKeys.push(''); // Handle gracefully later
        }

        this.currentKeyIndex = 0;
        logger.info(`[${character.name}] AI Service Ready (${this.apiKeys.length} keys)`);

        this.initializeModels();
    }

    loadApiKeys() {
        const keys = Object.keys(process.env)
            .filter(k => k.startsWith('GEMINI_API_KEY'))
            .sort()
            .map(k => process.env[k])
            .filter(k => k);
        return keys;
    }

    initializeModels() {
        this.genAI = new GoogleGenerativeAI(this.apiKeys[this.currentKeyIndex]);

        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ];

        this.chatModel = this.genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            safetySettings,
            generationConfig: {
                temperature: 1.1,
                maxOutputTokens: 4000,
            }
        });

        this.memoryModel = this.genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: { temperature: 0.1 }
        });
    }

    rotateApiKey() {
        if (this.apiKeys.length <= 1) return false;

        this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
        logger.info(`[${this.character.name}] Switching API key (${this.currentKeyIndex + 1}/${this.apiKeys.length})`);
        this.initializeModels();
        return true;
    }

    async shouldReply(username, messageContent, history) {
        let attempts = 0;

        while (attempts < this.apiKeys.length) {
            try {
                const prompt = prompts.shouldReply(this.character.name, messageContent, history);
                const result = await this.chatModel.generateContent(prompt);
                const response = result.response.text().trim().toUpperCase();
                return response.includes('YES');

            } catch (error) {
                if (this.isRateLimit(error)) {
                    if (this.rotateApiKey()) {
                        attempts++;
                        continue;
                    }
                }
                logger.error(`shouldReply Error: ${error.message}`);
                return true; // Default to yes on error
            }
        }
        return true;
    }

    async generateResponse(nickname, username, userId, history, location) {
        let attempts = 0;

        while (attempts < this.apiKeys.length) {
            try {
                // Fetch context in parallel
                const [userMem, globalMem, facts, relationships] = await Promise.all([
                    this.promisify(cb => memoryManager.getUserMemory(userId, this.character.name, cb)),
                    this.promisify(cb => memoryManager.getGlobal(this.character.name, cb)),
                    this.promisify(cb => memoryManager.getAllFacts(this.character.name, cb)),
                    this.promisify(cb => memoryManager.getRelationships(userId, this.character.name, cb))
                ]);

                // Filter context
                const filteredHistory = history.length > 30
                    ? [...history.slice(0, history.length - 30).filter(m => m.username.includes(this.character.name)), ...history.slice(-30)]
                    : history;

                const crossChannelContext = memoryManager.getRecentAcrossChannels(5);
                const otherConversations = crossChannelContext
                    .filter(msg => !history.find(h => h.id === msg.id))
                    .slice(-5);

                const systemPrompt = prompts.systemPrompt(
                    this.character.basePrompt,
                    location,
                    nickname,
                    username,
                    globalMem,
                    userMem,
                    facts,
                    relationships,
                    otherConversations,
                    filteredHistory
                );

                const result = await this.chatModel.generateContent(systemPrompt);
                const text = result.response.text();

                if (!text) logger.warn('Gemini returned empty response.');

                return text.trim();

            } catch (error) {
                if (this.isRateLimit(error)) {
                    if (this.rotateApiKey()) {
                        attempts++;
                        continue;
                    }
                }
                logger.error(`generateResponse Error: ${error.message}`);
                return "";
            }
        }
        return "";
    }

    async extractGossip(allConversations) {
        if (allConversations.length < 3) return;

        let attempts = 0;
        while (attempts < this.apiKeys.length) {
            try {
                const prompt = prompts.extractGossip(this.character.name, allConversations);
                const result = await this.memoryModel.generateContent(prompt);
                const text = result.response.text();

                const data = this.parseJson(text);

                if (data.gossip?.length > 0) {
                    data.gossip.forEach(fact => {
                        memoryManager.addGlobal(`[GOSSIP] ${fact}`, this.character.name);
                        logger.info(`[${this.character.name}] Gossip: ${fact}`);
                    });
                }
                return;

            } catch (error) {
                if (this.isRateLimit(error) && this.rotateApiKey()) {
                    attempts++;
                    continue;
                }
                logger.warn(`Gossip extraction failed: ${error.message}`);
                return;
            }
        }
    }

    async extractUserMemories(allConversations) {
        if (allConversations.length < 3) return;

        let attempts = 0;
        while (attempts < this.apiKeys.length) {
            try {
                const prompt = prompts.extractUserMemories(this.character.name, allConversations);
                const result = await this.memoryModel.generateContent(prompt);
                const text = result.response.text();

                const data = this.parseJson(text);

                data.user_facts?.forEach(f => {
                    memoryManager.setUserMemory(f.user_id, f.key, f.value, this.character.name);
                    logger.debug(`[${this.character.name}] Fact: ${f.user_id} -> ${f.key}`);
                });

                data.relationships?.forEach(r => {
                    const id1 = r.user_id_1 === this.character.name ? 'bot_' + this.character.name : r.user_id_1;
                    const id2 = r.user_id_2 === this.character.name ? 'bot_' + this.character.name : r.user_id_2;
                    memoryManager.addRelationship(id1, id2, r.type, r.description, this.character.name);
                });

                return;

            } catch (error) {
                if (this.isRateLimit(error) && this.rotateApiKey()) {
                    attempts++;
                    continue;
                }
                logger.warn(`Memory extraction failed: ${error.message}`);
                return;
            }
        }
    }

    async generateProactiveMessage(timeOfDay) {
        let attempts = 0;
        while (attempts < this.apiKeys.length) {
            try {
                const globalMem = await this.promisify(cb => memoryManager.getGlobal(this.character.name, cb));
                const gossip = globalMem
                    .map(m => m.content)
                    .filter(c => c.includes('[GOSSIP]')) // Only use marked gossip
                    .slice(0, 10);

                const prompt = prompts.proactiveMessage(this.character.name, timeOfDay, gossip);

                // Use chat model for this as it requires personality
                const result = await this.chatModel.generateContent(prompt);
                const text = result.response.text().trim();

                if (text.toUpperCase() === 'NO') return null;
                return text;

            } catch (error) {
                if (this.isRateLimit(error) && this.rotateApiKey()) {
                    attempts++;
                    continue;
                }
                logger.error(`Proactive Gen Error: ${error.message}`);
                return null;
            }
        }
    }

    // Helper functions
    promisify(fn) {
        return new Promise((resolve, reject) => {
            fn((err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });
    }

    isRateLimit(error) {
        return error.message && (error.message.includes('quota') || error.message.includes('RESOURCE_EXHAUSTED'));
    }

    parseJson(text) {
        try {
            const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(clean);
        } catch (e) {
            return {};
        }
    }
}

module.exports = GeminiService;