import { Link } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import { ModuleFrame } from './ModuleFrame';
import { DocRow } from '../../components/documents/DocRow';
import { setDocumentOffline } from '../../db/repos/documents';

export default function Documents() {
  return (
    <ModuleFrame module="documents" title="Documents" sub="Only this trip's documents. Passport and ID live in Wallet.">
      {({ documents }) => (
        <>
          <ul className="space-y-3">
            {documents.map((d) => (
              <DocRow key={d.id} doc={d} onToggleOffline={(v) => void setDocumentOffline(d.id, v)} />
            ))}
          </ul>
          <Link
            to="/wallet/scan"
            className="mt-4 flex min-h-tap items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line text-sm font-medium text-espresso"
          >
            <ScanLine size={18} /> Scan a document
          </Link>
        </>
      )}
    </ModuleFrame>
  );
}
