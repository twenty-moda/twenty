import { LegalPage, legalMetadata } from "../_components/legal-page";

export const metadata = legalMetadata("returns");

export default function Page() {
  return <LegalPage page="returns" />;
}
