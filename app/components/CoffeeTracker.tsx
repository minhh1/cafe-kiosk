import React, { useState } from 'react';

// React.memo prevents the component from flickering when other parts of the page update
const CoffeeTracker = React.memo(({ standard, extra, operator, confirmed, onConfirm, setStandard, setExtra, setOp, isSaving }: any) => {
  const [error, setError] = useState("");

  const handleNumericInput = (val: string, setter: (v: string) => void) => {
    if (val === "" || /^[0-9]*\.?[0-9]*$/.test(val)) {
      setter(val);
      setError("");
    } else {
      setError("Numbers only!");
    }
  };

  return (
    <div className={`p-3 rounded-2xl flex flex-col gap-1 transition-all ${confirmed ? 'bg-green-50 border-2 border-green-200 shadow-sm' : 'bg-orange-50 border border-orange-200'}`}>
      <span className={`text-[10px] font-black uppercase text-center ${confirmed ? 'text-green-700' : 'text-orange-800'}`}>
        Coffee Amount (kg)
      </span>
      
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center">
            <span className="text-[7px] font-black text-slate-400 uppercase">Standard</span>
            <input 
                disabled={confirmed} 
                type="text" 
                placeholder="10" 
                value={standard} 
                onChange={e => handleNumericInput(e.target.value, setStandard)} 
                className="w-12 p-1 rounded-lg text-center bg-white font-bold border-none outline-none shadow-inner text-slate-900" 
            />
        </div>
        
        <button disabled={confirmed} onClick={() => setOp(operator === '+' ? '-' : '+')} className="w-8 h-8 rounded-full bg-white shadow-sm border border-slate-200 font-black text-slate-600">{operator}</button>

        <div className="flex flex-col items-center">
            <span className="text-[7px] font-black text-slate-400 uppercase">Extra</span>
            <input 
                disabled={confirmed} 
                type="text" 
                value={extra} 
                placeholder="0" 
                onChange={e => handleNumericInput(e.target.value, setExtra)} 
                className="w-12 p-1 rounded-lg text-center bg-white font-bold border-none outline-none shadow-inner text-slate-900" 
            />
        </div>

        <button onClick={onConfirm} className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase shadow-md transition-all ${confirmed ? 'bg-green-600 text-white' : 'bg-orange-600 text-white'}`}>
            {isSaving ? '...' : (confirmed ? 'Confirmed' : 'Confirm')}
        </button>
      </div>
      {error && <p className="text-[8px] text-red-500 font-bold text-center absolute -bottom-4 left-0 right-0">{error}</p>}
    </div>
  );
});

export default CoffeeTracker;