export function extractDomainFromUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    let host = url.hostname.toLowerCase();
    if (host.startsWith("www.")) {
      host = host.slice(4);
    }
    if ((host === "localhost" || host.startsWith("127.")) && url.port) {
      return `${host}:${url.port}`;
    }
    return host;
  } catch {
    return "";
  }
}

/**
 * Returns all related root and auth domains for complex web apps (ChatGPT, Claude, etc.)
 */
export function getRelatedDomains(domain: string): string[] {
  const cleanDomain = domain.split(":")[0].toLowerCase();
  const domainsSet = new Set<string>([cleanDomain]);

  // If subdomains, add parent domains
  const parts = cleanDomain.split(".");
  if (parts.length >= 2) {
    const baseDomain = parts.slice(-2).join(".");
    domainsSet.add(baseDomain);
    domainsSet.add(`.${baseDomain}`);
  }

  // ChatGPT & OpenAI Ecosystem
  if (cleanDomain.includes("chatgpt.com") || cleanDomain.includes("openai.com")) {
    domainsSet.add("chatgpt.com");
    domainsSet.add(".chatgpt.com");
    domainsSet.add("openai.com");
    domainsSet.add(".openai.com");
    domainsSet.add("auth.openai.com");
    domainsSet.add("auth0.openai.com");
    domainsSet.add("cdn.oaistatic.com");
  }

  // Claude & Anthropic Ecosystem
  if (cleanDomain.includes("claude.ai") || cleanDomain.includes("anthropic.com")) {
    domainsSet.add("claude.ai");
    domainsSet.add(".claude.ai");
    domainsSet.add("anthropic.com");
    domainsSet.add(".anthropic.com");
  }

  // Google Ecosystem
  if (cleanDomain.includes("google.com")) {
    domainsSet.add("google.com");
    domainsSet.add(".google.com");
    domainsSet.add("accounts.google.com");
  }

  // GitHub
  if (cleanDomain.includes("github.com")) {
    domainsSet.add("github.com");
    domainsSet.add(".github.com");
  }

  return Array.from(domainsSet);
}

export function generateSessionId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 9);
  return `swp_${ts}_${rand}`;
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

const PALETTE = [
  { bg: "#fef08a", text: "#713f12", border: "#eab308" }, // Amber/Yellow
  { bg: "#bae6fd", text: "#0369a1", border: "#0284c7" }, // Sky/Cyan
  { bg: "#a7f3d0", text: "#065f46", border: "#10b981" }, // Emerald
  { bg: "#ddd6fe", text: "#5b21b6", border: "#8b5cf6" }, // Violet
  { bg: "#fbcfe8", text: "#9d174d", border: "#ec4899" }, // Pink
  { bg: "#fed7aa", text: "#9a3412", border: "#f97316" }, // Orange
  { bg: "#99f6e4", text: "#115e59", border: "#14b8a6" }, // Teal
  { bg: "#c7d2fe", text: "#3730a3", border: "#6366f1" }, // Indigo
  { bg: "#d9f99d", text: "#3f6212", border: "#84cc16" }, // Lime
  { bg: "#f5d0fe", text: "#86198f", border: "#d946ef" }, // Fuchsia
];

export function getTagColor(tagName: string = "DEFAULT"): { bg: string; text: string; border: string } {
  const clean = tagName.trim().toUpperCase();
  if (!clean || clean === "DEFAULT") {
    return { bg: "#e2e8f0", text: "#334155", border: "#94a3b8" };
  }
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
}
