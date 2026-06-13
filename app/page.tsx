"use client";
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function Kiosk() {
  const [shifts, setShifts] = useState([]);
  const [selectedShift, setSelectedShift] = useState<any>(null);
  const [pin, setPin] = useState("");
  const [step, setStep] = useState(1); // 1: List, 2: PIN, 3: Actions

  useEffect(() => {
    fetch('/api/roster').then(res => res.json()).then(data => setShifts(data));
  }, []);

  const handleAction = async (type: string, note: string = "") => {
    // Check PIN against Supabase
    const { data: user } = await supabase.from('staff_config')
      .select('*').eq('deputy_id', selectedShift.Employee).eq('pin', pin).single();

    if (!user) {
      alert("Wrong PIN!");
      return;
    }

    await supabase.from('attendance_logs').insert({
      shift_id: selectedShift.Id,
      staff_name: selectedShift.EmployeeName,
      action_type: type,
      notes: note
    });

    alert("Success!");
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 font-sans">
      <h1 className="text-3xl font-bold text-center mb-8">Cafe Sign-In</h1>

      {step === 1 && (
        <div className="grid gap-4 max-w-md mx-auto">
          {shifts.map((s: any) => (
            <button key={s.Id} onClick={() => {setSelectedShift(s); setStep(2)}} className="bg-white p-6 rounded-xl shadow-sm text-left border-2 border-transparent hover:border-orange-500">
              <div className="font-bold text-xl">{s.EmployeeName}</div>
              <div className="text-gray-500">{s.StartTimeLocalized} - {s.EndTimeLocalized}</div>
            </button>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="max-w-xs mx-auto text-center">
          <h2 className="text-xl mb-4">Enter PIN for {selectedShift.EmployeeName}</h2>
          <input type="password" value={pin} onChange={(e)=>setPin(e.target.value)} className="w-full p-4 text-3xl text-center rounded mb-4" maxLength={4} />
          <button onClick={()=>setStep(3)} className="w-full bg-orange-500 text-white p-4 rounded-xl font-bold">Next</button>
        </div>
      )}

      {step === 3 && (
        <div className="max-w-md mx-auto space-y-4">
          <button onClick={() => handleAction('START')} className="w-full bg-green-500 text-white p-8 rounded-2xl text-2xl font-bold">I'm Starting</button>
          <button onClick={() => handleAction('END')} className="w-full bg-red-500 text-white p-8 rounded-2xl text-2xl font-bold">I'm Finishing</button>
          <textarea id="note" placeholder="Any notes? (e.g. late because of bus)" className="w-full p-4 border rounded" />
          <button onClick={() => handleAction('NOTE', (document.getElementById('note') as HTMLTextAreaElement).value)} className="w-full bg-gray-500 text-white p-4 rounded-xl">Submit Note Only</button>
        </div>
      )}
    </div>
  );
}