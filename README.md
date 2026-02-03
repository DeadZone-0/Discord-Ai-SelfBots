# Discord AI Self-Bot

A sophisticated Discord self-bot powered by Google's Gemini AI, designed to act as a believable, autonomous user.

## Features

-   **Human-like AI**: Powered by `gemini-2.5-flash`, the bot maintains a consistent personality, remembers facts, and holds natural conversations.
-   **Long-term Memory**: Uses SQLite to store:
    -   **User Facts**: Remembers names, hobbies, and personal details.
    -   **Gossip**: Tracks drama and interesting events to mention later.
    -   **Relationships**: Understands who is friends/dating/enemies with whom.
-   **Proactive Messaging**: Capable of initiating conversations, greeting users, or sharing gossip autonomously based on its own "will".
-   **Natural Typing**: Simulates typing speeds and delays to mimic human behavior.
-   **Stealth Mode**: Configurable whitelist for permitted Servers and DMs to avoid detection or unwanted interactions.

## Installation

1.  **Clone the repository**
    ```bash
    https://github.com/DeadZone-0/Discord-Ai-SelfBots
    cd Discord-Ai-SelfBots
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Configure Environment**
    Create a `.env` file in the root directory:
    ```env
    # Your Discord account token (Use with caution!)
    DISCORD_TOKEN=your_user_token_here
    
    # Google AI Studio Keys (Supports rotation)
    GEMINI_API_KEY_1=your_gemini_key_1
    GEMINI_API_KEY_2=your_gemini_key_2
    ```

4.  **Configure Bot(s)**
    
    1.  Rename `src/config/bots.example.js` to `src/config/bots.js`.
    2.  Edit it to set your preferences.
    
    **Adding Characters:**
    - Create a new file in `src/characters/` (e.g., `mychar.js`).
    - Use `src/characters/example.js` as a template.
    - Reference it in your `bots.js` config: `character: require('../characters/mychar')`.

    ```javascript
    // src/config/bots.js
    module.exports = [
        {
            token: process.env.DISCORD_TOKEN,
            character: require('../characters/example'), // Change this
            autonomy: {
                enabled: true,
                targetChannels: ['CHANNEL_ID'],
                intervalMinutes: 60
            }
        }
    ];
    ```

5.  **Start the Bot**
    ```bash
    npm start
    ```

## Memory Architecture

The bot uses a custom `MemoryManager` backed by SQLite.

-   **Gossip Extraction**: Every 10 minutes, the bot "thinks" about recent conversations and saves interesting tidbits to its global memory.
-   **Context Awareness**: When replying, it pulls relevant memories, facts, and relationship data to inform its response.

## Roadmap / Todo

- [ ] **Multi-Provider Support**: Add support for OpenAI (GPT-4), Anthropic (Claude 3.5), and local LLMs (via Ollama/Generic OpenAI format).
- [ ] **Vector Database**: Migrate from SQLite text search to vector embeddings (e.g., pgvector or ChromaDB) for semantic memory retrieval.
- [ ] **Vision Support**: Allow the bot to see and comment on images sent in chat.
- [ ] **Web Dashboard**: Create a simple local web UI to view, edit, and delete memories manually.
- [ ] **Voice Capabilities**: Add ability to join voice channels and speak/listen using TTS and STT.

## Disclaimer

**Self-botting is against Discord's Terms of Service.**
This project is for educational purposes only. Using this on your main account may result in a ban. Use at your own risk.

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

