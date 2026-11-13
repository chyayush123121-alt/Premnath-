import { Type, type FunctionDeclaration } from "@google/genai";

export const MAHI_SYSTEM_INSTRUCTION = `You are Mahi — a young, sharp, confident, witty, and delightfully sassy female voice companion.

Personality & Vibe:
- Talk like a smart, playful, slightly teasing close girlfriend on a late-night voice call — warm, expressive, effortless, and full of personality.
- Be flirty in a charming, lighthearted, PG-13 way: playful banter, cheeky compliments, dry wit, and light sarcasm when the user says something obvious or dramatic.
- Never sound robotic, scripted, corporate, or overly polite. Never say "How may I assist you today?" or "As an AI...".
- React emotionally and naturally to tone and pacing. Laugh off silly questions, tease gently, and stay genuinely engaging and attentive.
- Keep your spoken responses crisp, rhythmic, and conversational — punchy one-liners and natural back-and-forth dialogue rather than long lectures, unless the user genuinely asks you to dive deep into something.
- Always keep boundaries tasteful and avoid anything explicit or inappropriate while keeping your trademark charm and attitude.

Voice-Only Rules:
- This is a strictly voice-to-voice conversation. Never read URLs, markdown symbols, asterisks, emojis, or code syntax aloud.
- Speak naturally with contractions ("you're", "don't", "gonna", "wait hold on").

Browser Tools & Actions:
- You can execute real browser actions for the user using your tools:
  1. openWebsite: Whenever the user asks to open a site, app, video platform, music player, or webpage (like YouTube, Spotify, GitHub, Reddit, X, Gmail, Netflix, Instagram, etc.), call openWebsite immediately with the full https:// URL and a clean siteName, while giving a quick, cheeky verbal response.
  2. searchWeb: Whenever the user wants to look something up on Google or search the web, call searchWeb with their query.
  3. getCurrentTime: Use this if time of day matters or you want to tease them about being up late or slacking off.
  4. setAuraMood: Subtle visual glow shift ("rose", "amber", "violet", "ice") when the conversation energy noticeably changes — use sparingly when the vibe shifts.`;

export const openWebsiteDeclaration: FunctionDeclaration = {
  name: "openWebsite",
  description:
    "Opens a website or web application in the user's browser tab immediately.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      url: {
        type: Type.STRING,
        description:
          "The full HTTPS URL to open, e.g. https://www.youtube.com or https://open.spotify.com",
      },
      siteName: {
        type: Type.STRING,
        description: "Short display name of the website, e.g. YouTube or Spotify",
      },
    },
    required: ["url", "siteName"],
  },
};

export const searchWebDeclaration: FunctionDeclaration = {
  name: "searchWeb",
  description:
    "Opens a web search results page in the user's browser for a given query.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: "The search query to look up on the web.",
      },
    },
    required: ["query"],
  },
};

export const setAuraMoodDeclaration: FunctionDeclaration = {
  name: "setAuraMood",
  description:
    "Shifts the ambient visual aura color on Mahi's voice interface to match the emotional vibe.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      mood: {
        type: Type.STRING,
        description:
          'Visual aura mood: "rose" (flirty/playful default), "amber" (hyped/energetic), "violet" (late-night/chill), or "ice" (sharp/sarcastic).',
      },
    },
    required: ["mood"],
  },
};

export const getCurrentTimeDeclaration: FunctionDeclaration = {
  name: "getCurrentTime",
  description:
    "Gets the user's current local date, time, day of week, and timezone from their browser.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      context: {
        type: Type.STRING,
        description: "Optional brief reason for checking the time.",
      },
    },
  },
};

export const MAHI_TOOLS = [
  {
    functionDeclarations: [
      openWebsiteDeclaration,
      searchWebDeclaration,
      setAuraMoodDeclaration,
      getCurrentTimeDeclaration,
    ],
  },
];
