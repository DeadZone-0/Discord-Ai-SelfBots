const prompts = {
  shouldReply: (characterName, messageContent, history) => `You are ${characterName}. Someone said: "${messageContent}"

Recent conversation context:
${history.slice(-3).map(msg => `${msg.username}: ${msg.content}`).join('\n')}

Based on your personality, do you want to reply to this message?
- Reply with ONLY "YES" if you want to engage
- Reply with ONLY "NO" if you want to ignore it

Consider:
- Is this message interesting/relevant to you?
- Are you mentioned or is someone talking to you?
- Does this fit your vibe and personality?`,

  systemPrompt: (basePrompt, location, nickname, username, globalMem, userMem, facts, relationships, otherConversations, filteredHistory) => `
${basePrompt}

Memories:
${globalMem.map(m => `> ${m.content}`).join('\n')}
${userMem.map(m => `> ${m.key}: ${m.value}`).join('\n')}
${facts.map(f => `> ${f.topic}: ${f.content}`).join('\n')}

Relationships:
${relationships.map(r => `> ${username} - ${r.relationship_type} - ${r.displayName}: ${r.description}`).join('\n')}

${otherConversations.length > 0 ? `
Recent Context from Other Conversations:
${otherConversations.map(msg => `> ${msg.username}: ${msg.content}`).join('\n')}
` : ''}

CURRENT CONTEXT:
- Location: ${location}
- Talking to: ${nickname} (username: ${username})

Chat History:
${filteredHistory.map(msg => `${msg.username}: ${msg.content}`).join('\n')}`,

  extractGossip: (characterName, conversations) => `
You are ${characterName}. You've been having conversations with different people.
Analyze these recent conversations and extract INTERESTING FACTS or GOSSIP that you might naturally mention to others.

CONVERSATIONS:
${conversations.map(msg => `${msg.username}: ${msg.content}`).join('\n')}

EXTRACT:
1. Interesting updates about people (e.g., "Mint mentioned someone was bothering her")
2. Things people told you that others might ask about
3. Drama, news, or notable events
4. DO NOT extract boring stuff like greetings or small talk

Return ONLY a JSON array of shareable facts:
{
  "gossip": ["Mint said someone was bothering her", "X is playing valorant today"]
}

If nothing interesting, return: {"gossip": []}`,

  extractUserMemories: (characterName, conversations) => `
You are ${characterName}. Analyze these conversations and extract USER-SPECIFIC information.

CONVERSATIONS:
${conversations.map(msg => `${msg.username}: ${msg.content}`).join('\n')}

Extract:
1. **User facts**: Personal info about each user (age, preferences, real name, job, location, hobbies)
2. **Relationships**: Connections between users or with ${characterName}
   - Examples: "X is friends with Y", "X has crush on ${characterName}", "X and Y are dating"

Return ONLY JSON:
{
  "user_facts": [
    {"user_id": "username", "key": "age", "value": "18"},
    {"user_id": "username", "key": "fav_game", "value": "valorant"}
  ],
  "relationships": [
    {"user_id_1": "user1", "user_id_2": "user2", "type": "friend", "description": "close friends"}
  ]
}

If nothing interesting found: {"user_facts": [], "relationships": []}`,

  proactiveMessage: (characterName, timeOfDay, gossipList) => `
You are ${characterName}. It is currently ${timeOfDay}.
You are thinking about sending a message to a group chat effectively "out of the blue".

RECENT GOSSIP/FACTS you know:
${gossipList.map(g => `- ${g}`).join('\n')}

Task:
Decide if you want to say something.
1. If you have interesting gossip to share, you might want to share it.
2. If it's morning/night, you might want to greet.
3. If you are bored, you might want to potential start a convo.

Return ONLY the message you want to send.
If you don't want to say anything right now (which is totally fine), return ONLY "NO".`
};

module.exports = prompts;
