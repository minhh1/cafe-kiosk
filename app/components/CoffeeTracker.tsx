export default function CoffeeTracker({ standard, extra, operator, confirmed, onConfirm, setStandard, setExtra, setOp, isSaving }: any) {
  return (
    <div className={`p-3 rounded-2xl flex flex-col gap-2 transition-colors ${confirmed ? 'bg-green-50 border-2 border-green-200 shadow-sm' : 'bg-orange-50 border border-orange-200'}`}>
      {/* CLEAR LABEL ADDED HERE */}
      <span className={`text-[10px] font-black uppercase tracking-[0.1em] text-center ${confirmed ? 'text-green-700' : 'text-orange-800'}`}>
        Coffee Amount (kg)
      </span>
      
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center">
            <span className="text-[7px] font-black text-slate-400 uppercase">Standard</span>
            <input disabled={confirmed} type="number" placeholder="10" value={standard} onChange={e => setStandard(e.target.value)} className="w-12 p-1 rounded-lg text-center bg-white font-bold border-none outline-none shadow-inner" />
        </div>
        
        <button disabled={confirmed} onClick={() => setOp(operator === '+' ? '-' : '+')} className={`w-8 h-8 rounded-full font-black text-lg flex items-center justify-center transition-colors ${operator === '+' ? 'bg-orange-500 text-white' : 'bg-blue-500 text-white'}`}>
            {operator}
        </button>

        <div className="flex flex-col items-center">
            <span className="text-[7px] font-black text-slate-400 uppercase">Extra</span>
            <input disabled={confirmed} type="number" value={extra} placeholder="0" onChange={e => setExtra(e.target.value)} className="w-12 p-1 rounded-lg text-center bg-white font-bold border-none outline-none shadow-inner" />
        </div>

        <button onClick={onConfirm} className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase shadow-md transition-all ${confirmed ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-orange-600 text-white hover:scale-105'}`}>
            {isSaving ? '...' : (confirmed ? 'Confirmed' : 'Confirm')}
        </button>
      </div>
    </div>
  );
}