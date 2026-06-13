export default function CoffeeTracker({ standard, extra, operator, confirmed, onConfirm, setStandard, setExtra, setOp, isSaving }: any) {
  return (
    <div className={`p-3 rounded-2xl flex items-center gap-3 transition-colors ${confirmed ? 'bg-green-50 border-2 border-green-200' : 'bg-orange-50 border border-orange-200'}`}>
      <div className="flex flex-col items-center">
        <span className="text-[8px] font-black text-slate-400 uppercase">Standard</span>
        <input disabled={confirmed} type="number" placeholder="10" value={standard} onChange={e => setStandard(e.target.value)} className="w-12 p-1 rounded-lg text-center bg-white font-bold border-none" />
      </div>
      <button disabled={confirmed} onClick={() => setOp(operator === '+' ? '-' : '+')} className="w-8 h-8 rounded-full bg-slate-200 font-black">{operator}</button>
      <div className="flex flex-col items-center">
        <span className="text-[8px] font-black text-slate-400 uppercase">Extra</span>
        <input disabled={confirmed} type="number" value={extra} placeholder="0" onChange={e => setExtra(e.target.value)} className="w-12 p-1 rounded-lg text-center bg-white font-bold border-none" />
      </div>
      <button onClick={onConfirm} className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase shadow-md transition-all ${confirmed ? 'bg-green-600 text-white' : 'bg-orange-600 text-white hover:scale-105'}`}>
        {isSaving ? '...' : (confirmed ? 'Confirmed' : 'Confirm')}
      </button>
    </div>
  );
}