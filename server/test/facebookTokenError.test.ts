import { describe, it, expect } from "vitest";
import { FacebookError, graphError, isTokenError } from "../src/facebook/client.js";

// Punto 2 del pacchetto "publishing & jobs": riconoscimento del token di pagina scaduto/revocato.
// graphError deve estrarre code/type dal body.error di Graph; isTokenError deve identificare i casi
// non ritentabili (code 190 / type OAuthException) senza scambiarli per errori transitori.

describe("graphError", () => {
  it("estrae code e type dal body.error di Graph", () => {
    const body = {
      error: { message: "Error validating access token", code: 190, type: "OAuthException" },
    };
    const e = graphError("Graph API publishFeedPost: boom", body, 400);
    expect(e).toBeInstanceOf(FacebookError);
    expect(e.httpStatus).toBe(400);
    expect(e.code).toBe(190);
    expect(e.type).toBe("OAuthException");
    expect(e.message).toBe("Graph API publishFeedPost: boom");
  });

  it("lascia code/type undefined quando il body non li espone", () => {
    const e = graphError("Graph API x: HTTP 500", {}, 500);
    expect(e.code).toBeUndefined();
    expect(e.type).toBeUndefined();
  });
});

describe("isTokenError", () => {
  it("riconosce il code 190", () => {
    expect(isTokenError(new FacebookError("boom", 400, 190))).toBe(true);
  });

  it("riconosce il type OAuthException", () => {
    expect(isTokenError(new FacebookError("boom", 400, undefined, "OAuthException"))).toBe(true);
  });

  it("riconosce il messaggio di token scaduto anche senza code/type", () => {
    expect(
      isTokenError(new FacebookError("Graph API x: Error validating access token", 400)),
    ).toBe(true);
    expect(
      isTokenError(new FacebookError("Graph API x: Session has expired", 400)),
    ).toBe(true);
  });

  it("NON scambia un errore transitorio (rete/5xx/rate limit) per token scaduto", () => {
    expect(isTokenError(new FacebookError("Chiamata fallita: timeout", -1))).toBe(false);
    expect(isTokenError(new FacebookError("Graph API x: HTTP 500", 500))).toBe(false);
    expect(isTokenError(new FacebookError("Graph API x: rate limit", 429, 4))).toBe(false);
  });

  it("ritorna false per errori che non sono FacebookError", () => {
    expect(isTokenError(new Error("boom"))).toBe(false);
    expect(isTokenError("boom")).toBe(false);
    expect(isTokenError(null)).toBe(false);
  });
});
