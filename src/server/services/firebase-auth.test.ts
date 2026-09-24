import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { InvalidIdTokenError, verifyFirebaseIdToken } from "./firebase-auth";

const PROJECT = "twenty-moda";
const now = new Date("2026-09-24T20:00:00Z");
const seconds = Math.floor(now.getTime() / 1000);
let privateKey: CryptoKey;
let keys: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  keys = createLocalJWKSet({ keys: [jwk] });
});

const token = (claims: Record<string, unknown> = {}, { aud = PROJECT, iss = `https://securetoken.google.com/${PROJECT}`, iat = seconds - 30, exp = seconds + 3600 } = {}) =>
  new SignJWT({ email: "Ana@Example.com", email_verified: true, name: "Ana Pérez", picture: "https://lh3.googleusercontent.com/a/x", auth_time: seconds - 30, firebase: { sign_in_provider: "google.com" }, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setSubject("uid-123")
    .setAudience(aud)
    .setIssuer(iss)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(privateKey);

describe("verifyFirebaseIdToken", () => {
  it("devuelve la identidad de Google con el email en minúsculas", async () => {
    expect(await verifyFirebaseIdToken(await token(), PROJECT, keys, now)).toEqual({
      uid: "uid-123",
      email: "ana@example.com",
      name: "Ana Pérez",
      picture: "https://lh3.googleusercontent.com/a/x",
      provider: "google.com",
    });
  });

  it("acepta correo y contraseña con el email verificado", async () => {
    const identity = await verifyFirebaseIdToken(await token({ firebase: { sign_in_provider: "password" }, picture: undefined }), PROJECT, keys, now);
    expect(identity).toMatchObject({ uid: "uid-123", provider: "password", picture: null });
  });

  it.each([
    ["otro proyecto", () => token({}, { aud: "otro-proyecto" })],
    ["otro emisor", () => token({}, { iss: "https://securetoken.google.com/otro" })],
    ["vencido", () => token({}, { iat: seconds - 7200, exp: seconds - 3600 })],
    ["email sin verificar", () => token({ email_verified: false })],
    ["sin email", () => token({ email: undefined })],
    ["otro método de ingreso", () => token({ firebase: { sign_in_provider: "anonymous" } })],
    ["con contraseña sin verificar el correo", () => token({ firebase: { sign_in_provider: "password" }, email_verified: false })],
    ["ingreso viejo", () => token({ auth_time: seconds - 3600 })],
  ])("rechaza un token %s", async (_, make) => {
    await expect(verifyFirebaseIdToken(await make(), PROJECT, keys, now)).rejects.toBeInstanceOf(InvalidIdTokenError);
  });

  it("rechaza un token firmado con otra llave", async () => {
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({ email: "a@b.pe", email_verified: true, auth_time: seconds, firebase: { sign_in_provider: "google.com" } })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setSubject("x")
      .setAudience(PROJECT)
      .setIssuer(`https://securetoken.google.com/${PROJECT}`)
      .setIssuedAt(seconds)
      .setExpirationTime(seconds + 3600)
      .sign(other.privateKey);
    await expect(verifyFirebaseIdToken(forged, PROJECT, keys, now)).rejects.toBeInstanceOf(InvalidIdTokenError);
  });
});
