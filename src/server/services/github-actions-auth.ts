/**
 * Verifica el token OIDC que GitHub Actions le da a un workflow con `permissions: id-token: write`. Así un workflow
 * de este repo llama a un cron de la tienda sin guardar ningún secreto: GitHub firma de qué repo, rama, workflow y
 * evento viene, y aquí se valida con sus llaves públicas. Solo vale ese workflow en `main` de este repo (por su id,
 * que no cambia si se renombra), corrido por su horario o a mano. Un fork o una rama no pasan.
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_KEYS = createRemoteJWKSet(new URL(`${GITHUB_ISSUER}/.well-known/jwks`));

/** La audiencia que pide el workflow al sacar el token (`&audience=` en la URL de GitHub). */
export const CRON_AUDIENCE = "twentymoda-cron";
/** twenty-moda/twenty: ids de GitHub del repo y de la organización (`gh api repos/twenty-moda/twenty`). */
const REPOSITORY_ID = "1386133638";
const REPOSITORY_OWNER_ID = "333482275";
const MAIN = "refs/heads/main";
const EVENTS = ["schedule", "workflow_dispatch"];

/** ¿El header `Authorization: Bearer <token>` es de `workflow` (nombre del archivo en .github/workflows) en main? */
export async function isGithubCronRequest(authorization: string | null, workflow: string, keys: JWTVerifyGetKey = GITHUB_KEYS, now = new Date()): Promise<boolean> {
  const token = authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, keys, { algorithms: ["RS256"], issuer: GITHUB_ISSUER, audience: CRON_AUDIENCE, currentDate: now });
    return (
      payload.repository_id === REPOSITORY_ID &&
      payload.repository_owner_id === REPOSITORY_OWNER_ID &&
      payload.ref === MAIN &&
      EVENTS.includes(payload.event_name as string) &&
      typeof payload.workflow_ref === "string" &&
      payload.workflow_ref.endsWith(`/.github/workflows/${workflow}@${MAIN}`)
    );
  } catch {
    return false;
  }
}
