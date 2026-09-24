import { LegalPage, legalMetadata } from "../_components/legal-page";

export const metadata = legalMetadata("terms");

export default function Page() {
  return <LegalPage page="terms" />;
}
