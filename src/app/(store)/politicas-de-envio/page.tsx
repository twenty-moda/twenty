import { LegalPage, legalMetadata } from "../_components/legal-page";

export const metadata = legalMetadata("shipping");

export default function Page() {
  return <LegalPage page="shipping" />;
}
