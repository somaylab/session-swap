import { CookieSnapshot } from "@shared/types";
import { getRelatedDomains } from "@shared/utils";

export class CookieEngine {
  /**
   * Captures all relevant cookies for a domain and its related authentication hosts.
   */
  async captureCookiesForDomain(domain: string): Promise<CookieSnapshot[]> {
    try {
      const stores = await chrome.cookies.getAllCookieStores();
      const relatedDomains = getRelatedDomains(domain);
      const snapshots: CookieSnapshot[] = [];
      const seenCookieKeys = new Set<string>();

      for (const store of stores) {
        const storeCookies = await chrome.cookies.getAll({ storeId: store.id });

        for (const cookie of storeCookies) {
          const cookieDomain = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;

          // Check if matches domain, subdomain, or related auth domain
          const isMatch = relatedDomains.some((rel) => {
            const cleanRel = rel.startsWith(".") ? rel.slice(1) : rel;
            return (
              cookieDomain === cleanRel ||
              cookieDomain.endsWith(`.${cleanRel}`) ||
              cleanRel.endsWith(`.${cookieDomain}`)
            );
          });

          if (isMatch) {
            const uniqueKey = `${cookie.name}@@${cookie.domain}@@${cookie.path}@@${store.id}`;
            if (!seenCookieKeys.has(uniqueKey)) {
              seenCookieKeys.add(uniqueKey);
              snapshots.push({
                name: cookie.name,
                value: cookie.value,
                domain: cookie.domain,
                path: cookie.path,
                secure: cookie.secure,
                httpOnly: cookie.httpOnly,
                sameSite: cookie.sameSite,
                expirationDate: cookie.session ? undefined : cookie.expirationDate,
                storeId: cookie.storeId,
                partitionKey: (cookie as { partitionKey?: { topLevelSite?: string } }).partitionKey,
              });
            }
          }
        }
      }

      return snapshots;
    } catch (err) {
      console.error("[CookieEngine] Error capturing cookies:", err);
      return [];
    }
  }

  /**
   * Deletes all cookies associated with the given domain and its auth cluster.
   */
  async clearCookiesForDomain(domain: string): Promise<void> {
    const cookies = await this.captureCookiesForDomain(domain);
    const removePromises = cookies.map(async (cookie) => {
      try {
        const url = this.buildCookieUrl(cookie, domain);
        await chrome.cookies.remove({
          url,
          name: cookie.name,
          storeId: cookie.storeId,
          partitionKey: cookie.partitionKey,
        });
      } catch (err) {
        console.warn(`[CookieEngine] Failed to delete cookie: ${cookie.name}`, err);
      }
    });

    await Promise.all(removePromises);
  }

  /**
   * Restores a snapshot of cookies.
   */
  async restoreCookies(cookies: CookieSnapshot[], fallbackDomain: string): Promise<void> {
    const restorePromises = cookies.map(async (cookie) => {
      try {
        const setDetails = this.prepareSetDetails(cookie, fallbackDomain);
        await chrome.cookies.set(setDetails);
      } catch (err) {
        console.warn(`[CookieEngine] Failed to restore cookie ${cookie.name}:`, err);
      }
    });

    await Promise.all(restorePromises);
  }

  /**
   * Constructs a valid URL for chrome.cookies API calls.
   */
  private buildCookieUrl(cookie: CookieSnapshot, fallbackDomain: string): string {
    const protocol = cookie.secure ? "https" : "http";
    let rawDomain = cookie.domain || fallbackDomain;
    if (rawDomain.startsWith(".")) {
      rawDomain = rawDomain.slice(1);
    }
    const cleanDomain = rawDomain.split(":")[0];
    const cleanPath = cookie.path && cookie.path.startsWith("/") ? cookie.path : "/";
    return `${protocol}://${cleanDomain}${cleanPath}`;
  }

  /**
   * Prepares valid SetDetails adhering to browser security rules (__Host-, __Secure-, CHIPS).
   */
  private prepareSetDetails(
    cookie: CookieSnapshot,
    fallbackDomain: string
  ): chrome.cookies.SetDetails {
    const url = this.buildCookieUrl(cookie, fallbackDomain);
    const isHostCookie = cookie.name.startsWith("__Host-");
    const isSecureCookie = cookie.name.startsWith("__Secure-");

    const details: chrome.cookies.SetDetails = {
      url,
      name: cookie.name,
      value: cookie.value,
      path: isHostCookie ? "/" : cookie.path || "/",
      secure: isHostCookie || isSecureCookie ? true : cookie.secure,
      httpOnly: cookie.httpOnly,
      storeId: cookie.storeId,
    };

    // __Host- cookies MUST NOT specify domain (they are host-only)
    if (!isHostCookie && cookie.domain && cookie.domain.startsWith(".")) {
      details.domain = cookie.domain;
    }

    if (cookie.expirationDate) {
      details.expirationDate = cookie.expirationDate;
    }

    if (cookie.sameSite && cookie.sameSite !== "unspecified") {
      details.sameSite = cookie.sameSite;
    }

    if (cookie.partitionKey) {
      details.partitionKey = cookie.partitionKey;
    }

    return details;
  }
}
