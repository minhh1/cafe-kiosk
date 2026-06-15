import React, { useState } from 'react';

export default function PinModal({ onVerify, onClose }: any) {
  const [input, setInput] = useState("");
  return (
    <div className="fixed inset-0 bg-black/80 z-[500] flex items-center justify-center p-4 backdrop-blur-md">
      <div className="bg-white p-8 rounded-3xl w-full max-w-xs shadow-2xl text-center">
        <h2 className="text-xl font-black mb-2 uppercase italic">Manager PIN</h2>
        <p className="text-[10px] text-slate-400 uppercase font-bold mb-6">Authorization Required</p>
        <form onSubmit={(e) => { e.preventDefault(); onVerify(input); }} className="space-y-4">
          <input autoFocus type="password" pattern="[0-9]*" inputMode="numeric" maxLength={4} value={input}
            onChange={e => setInput(e.target.value)} placeholder="****"
            className="w-full text-center text-4xl p-4 border-2 border-slate-100 rounded-2xl bg-slate-50 outline-none focus:border-orange-500 tracking-[0.5em] font-black text-slate-900" />
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-slate-900 text-white p-4 rounded-2xl font-black uppercase text-xs">Verify</button>
            <button type="button" onClick={onClose} className="px-4 text-slate-400 font-bold uppercase text-[10px]">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}