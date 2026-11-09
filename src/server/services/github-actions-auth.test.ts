import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { CRON_AUDIENCE, isGithubCronRequest } from "./github-actions-auth";

const WORKFLOW = "expirar-pedidos.yml";
const now = new Date("2026-11-09T20:00:00Z");
const seconds = Math.floor(now.getTime() / 1000);
let privateKey: CryptoKey;
let keys: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "gh1", alg: "RS256", use: "sig" };
  keys = createLocalJWKSet({ keys: [jwk] });
});

/** Los claims que GitHub pone en el token de un workflow (los que se revisan). */
const header = async (claims: Record<string, unknown> = {}, { aud = CRON_AUDIENCE, iss = "https://token.actions.githubusercontent.com", exp = seconds + 300 } = {}) =>
  `Bearer ${await new SignJWT({
    repository: "twenty-moda/twenty",
    repository_id: "1386133638",
    repository_owner_id: "333482275",
    ref: "refs/heads/main",
    event_name: "schedule",
    workflow_ref: `twenty-moda/twenty/.github/workflows/${WORKFLOW}@refs/heads/main`,
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "gh1" })
    .setSubject("repo:twenty-moda/twenty:ref:refs/heads/main")
    .setAudience(aud)
    .setIssuer(iss)
    .setIssuedAt(seconds - 10)
    .setExpirationTime(exp)
    .sign(privateKey)}`;

describe("isGithubCronRequest", () => {
  it("acepta el workflow de main por su horario o corrido a mano", async () => {
    expect(await isGithubCronRequest(await header(), WORKFLOW, keys, now)).toBe(true);
    expect(await isGithubCronRequest(await header({ event_name: "workflow_dispatch" }), WORKFLOW, keys, now)).toBe(true);
  });

  it.each([
    ["sin header", async () => null],
    ["otro esquema", async () => (await header()).replace("Bearer", "Basic")],
    ["otra audiencia", () => header({}, { aud: "otra-cosa" })],
    ["otro emisor", () => header({}, { iss: "https://example.com" })],
    ["vencido", () => header({}, { exp: seconds - 60 })],
    ["un fork (otro repo)", () => header({ repository_id: "999", repository: "alguien/twenty" })],
    ["otra organización", () => header({ repository_owner_id: "999" })],
    ["otra rama", () => header({ ref: "refs/heads/preview", workflow_ref: `twenty-moda/twenty/.github/workflows/${WORKFLOW}@refs/heads/preview` })],
    ["un pull request", () => header({ event_name: "pull_request" })],
    ["otro workflow", () => header({ workflow_ref: "twenty-moda/twenty/.github/workflows/ci.yml@refs/heads/main" })],
  ])("rechaza: %s", async (_case, make) => {
    expect(await isGithubCronRequest(await make(), WORKFLOW, keys, now)).toBe(false);
  });

  it("rechaza un token firmado con otra llave", async () => {
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({ repository_id: "1386133638", repository_owner_id: "333482275", ref: "refs/heads/main", event_name: "schedule", workflow_ref: `x/.github/workflows/${WORKFLOW}@refs/heads/main` })
      .setProtectedHeader({ alg: "RS256", kid: "gh1" })
      .setAudience(CRON_AUDIENCE)
      .setIssuer("https://token.actions.githubusercontent.com")
      .setIssuedAt(seconds - 10)
      .setExpirationTime(seconds + 300)
      .sign(other.privateKey);
    expect(await isGithubCronRequest(`Bearer ${forged}`, WORKFLOW, keys, now)).toBe(false);
  });
});
