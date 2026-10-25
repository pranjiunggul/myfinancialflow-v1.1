import React from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react';
import { PPH_PERSISTENT_DISCLAIMER_TEXT_ID, PPH_PERSISTENT_DISCLAIMER_TEXT, acknowledgeTaxEstimatorDisclaimer } from '../../services/tax';

interface TaxDisclaimerModalProps {
  isOpen: boolean;
  onAcknowledge: () => void;
  onCancel: () => void;
}

export const TaxDisclaimerModal: React.FC<TaxDisclaimerModalProps> = ({
  isOpen,
  onAcknowledge,
  onCancel,
}) => {
  if (!isOpen) return null;

  const handleAgree = async () => {
    await acknowledgeTaxEstimatorDisclaimer();
    onAcknowledge();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-lg bg-slate-900 border border-amber-500/40 rounded-3xl shadow-2xl p-6 sm:p-7 space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center space-x-3">
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Konfirmasi & Batasan Fitur Estimasi PPh</h2>
            <p className="text-xs text-amber-400/90 font-medium">Alat Perencanaan Pribadi, Bukan Pelaporan Pajak Resmi</p>
          </div>
        </div>

        <div className="p-4 bg-amber-950/30 border border-amber-500/30 rounded-2xl space-y-3 text-xs text-slate-300 leading-relaxed max-h-[55vh] overflow-y-auto">
          <div className="flex items-start space-x-2 text-amber-200 font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <span>Pemberitahuan Penting & Batasan Hukum:</span>
          </div>

          <p>
            {PPH_PERSISTENT_DISCLAIMER_TEXT_ID}
          </p>

          <div className="pt-2 border-t border-amber-500/20 space-y-2">
            <p className="font-semibold text-white">Hal-Hal Kunci yang Perlu Diketahui:</p>
            <ul className="list-disc pl-4 space-y-1 text-slate-300">
              <li>
                <strong className="text-amber-200">PTKP Berlaku 1x:</strong> PTKP berlaku untuk total akumulasi semua penghasilan Anda. Jika Anda juga menerima gaji kantor (di mana PTKP sudah dipotong oleh perusahaan), Anda dapat mengisi kolom gaji eksternal di pengaturan agar PTKP tidak terpotong dua kali.
              </li>
              <li>
                <strong className="text-amber-200">Norma Penghasilan (NPPN):</strong> Penghasilan pekerjaan bebas (freelance, affiliate) dapat menggunakan persentase Norma jika telah memberitahukan ke DJP, bukan dihitung murni dari bruto.
              </li>
              <li>
                <strong className="text-amber-200">Bukan Klien Resmi DJP:</strong> Aplikasi ini tidak mengirim data Anda ke server DJP dan tidak menggantikan kewajiban pelaporan SPT Tahunan melalui Coretax (<a href="https://pajak.go.id" target="_blank" rel="noreferrer" className="text-blue-400 underline inline-flex items-center gap-0.5">pajak.go.id <ExternalLink className="w-3 h-3" /></a>).
              </li>
            </ul>
          </div>

          <p className="text-[11px] text-slate-400 italic">
            English Reference: "{PPH_PERSISTENT_DISCLAIMER_TEXT}"
          </p>
        </div>

        <div className="flex items-center space-x-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 px-4 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold text-xs transition"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleAgree}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-900/40 transition flex items-center justify-center space-x-1.5"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Saya Mengerti & Lanjutkan</span>
          </button>
        </div>
      </div>
    </div>
  );
};
