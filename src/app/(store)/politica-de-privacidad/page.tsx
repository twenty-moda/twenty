import { LegalPage, legalMetadata } from "../_components/legal-page";

export const metadata = legalMetadata("privacy");

export default function Page() {
  return <LegalPage page="privacy" />;
}
