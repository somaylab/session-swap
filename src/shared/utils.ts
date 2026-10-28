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

export const TAG_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Work: { bg: "#FFE500", text: "#000000", border: "#000000" },
  Personal: { bg: "#00F0FF", text: "#000000", border: "#000000" },
  Admin: { bg: "#FF0055", text: "#FFFFFF", border: "#000000" },
  QA: { bg: "#00FF66", text: "#000000", border: "#000000" },
  Bot: { bg: "#B026FF", text: "#FFFFFF", border: "#000000" },
  Default: { bg: "#E5E5E5", text: "#000000", border: "#000000" },
};
