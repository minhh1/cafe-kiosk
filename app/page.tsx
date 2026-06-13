"use client";
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const STATUS_COLORS: any = {
  ON_TIME: { bg: 'bg-green-600', border: 'border-green-200', text: 'text-green-700', light: 'bg-green-50', ring: 'ring-green-600' },
  LATE: { bg: 'bg-amber-500', border: 'border-amber-200', text: 'text-amber-700', light: 'bg-amber-50', ring: 'ring-amber-500' },
  NO_SHOW: { bg: 'bg-red-600', border: 'border-red-200', text: 'text-red-700', light: 'bg-red-50', ring: 'ring-red-600' },
  OTHER: { bg: 'bg-slate-500', border: 'border-slate-200', text: 'text-slate-700', light: 'bg-slate-50', ring: 'ring-slate-500' },
};

export default function MartinPlaceDashboard() {
  // --- 1. STATE ---
  const [shifts, setShifts] = useState<any[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [coffeeStats, setCoffeeStats] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [activeForm, setActiveForm] = useState<{id: any, type: string} | null>(null);
  const [formTime, setFormTime] = useState("");
  const [formNote, setFormNote] = useState("");
  const [showManualModal, setShowManualModal] = useState(false);
  const [newManualShift, setNewManualShift] = useState({ name: '', start: '', end: '', team: 'FOH Team', date: '' });

  const [coffeeStandard, setCoffeeStandard] = useState<string>("");
  const [coffeeExtra, setCoffeeExtra] = useState<string>("");
  const [coffeeOperator, setCoffeeOperator] = useState<'+' | '-'>('+');
  const [isCoffeeConfirmed, setIsCoffeeConfirmed] = useState<boolean>(false);

  // --- 2. CALCULATED DATA ---
  const weekRange = useMemo(() => {
    const d = new Date(selectedDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d.setDate(diff));
    const days = Array.from({length: 7}, (_, i) => {
        const date = new Date(mon);
        date.setDate(date.getDate() + i);
        return date.toISOString().split('T')[0];
    });
    return { mon: days[0], sun: days[6], days };
  }, [selectedDate]);

  const confirmedWeeklyCoffeeTotal = useMemo(() => {
    return coffeeStats.filter(c => c.is_confirmed).reduce((sum, c) => sum + (c.coffee_total || 0), 0);
  }, [coffeeStats]);

  const getLatestLog = (shiftId: any) => attendanceLogs.find(l => l.shift_id.toString() === shiftId.toString() && !l.action_type.startsWith('EDIT'));
  const getDeputyFmt = (v: any) => typeof v === 'number' ? new Date(v * 1000).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase() : v;

  // --- 3. DATA FETCHING ---
  const fetchData = async () => {
    setLoading(true);
    try {
      const rosterRes = await fetch(`/api/roster?startDate=${viewMode === 'daily' ? selectedDate : weekRange.mon}&endDate=${viewMode === 'daily' ? selectedDate : weekRange.sun}`);
      const rosterData = await rosterRes.json();
      const { data: manualData } = await supabase.from('manual_shifts').select('*').gte('shift_date', weekRange.mon).lte('shift_date', weekRange.sun);
      const { data: logs } = await supabase.from('attendance_logs').select('*').order('created_at', { ascending: false });
      const { data: coffee } = await supabase.from('daily_stats').select('*').gte('date', weekRange.mon).lte('date', weekRange.sun);

      const formattedManual = (manualData || []).map(m => ({
        Id: `manual-${m.id}`, IsManual: true, StartTime: m.start_time_str, EndTime: m.end_time_str, Team: m.team, Date: m.shift_date,
        _DPMetaData: { EmployeeInfo: { DisplayName: m.staff_name }, OperationalUnitInfo: { OperationalUnitName: m.team } }
      }));

      setShifts([...(Array.isArray(rosterData) ? rosterData : []), ...formattedManual]);
      setAttendanceLogs(logs || []);
      setCoffeeStats(coffee || []);
      
      const todayC = (coffee || []).find(c => c.date === selectedDate);
      setCoffeeStandard(todayC?.coffee_standard?.toString() || "");
      setCoffeeExtra(todayC?.coffee_extra?.toString() || "");
      setCoffeeOperator(todayC?.coffee_operator || '+');
      setIsCoffeeConfirmed(todayC?.is_confirmed || false);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [selectedDate, viewMode]);

  // --- 4. ACTIONS ---
  const handleConfirmCoffee = async () => {
    setIsSaving(true);
    
    // REVERSAL LOGIC: If already confirmed, set to 0 and unconfirm
    if (isCoffeeConfirmed) {
        const { error } = await supabase.from('daily_stats').upsert({ 
            date: selectedDate, 
            coffee_total: 0, 
            is_confirmed: false 
        });
        if (!error) {
            setIsCoffeeConfirmed(false);
            await fetchData();
        }
    } else {
        // CONFIRM LOGIC:
        const std = parseFloat(coffeeStandard) || 10;
        const ext = parseFloat(coffeeExtra) || 0;
        const total = coffeeOperator === '+' ? std + ext : std - ext;
        const { error } = await supabase.from('daily_stats').upsert({ 
            date: selectedDate, coffee_standard: std, coffee_extra: ext, 
            coffee_operator: coffeeOperator, coffee_total: total, is_confirmed: true 
        });
        if (!error) {
            setIsCoffeeConfirmed(true);
            await fetchData();
        }
    }
    setIsSaving(false);
  };

  const handleCreateManual = async () => {
    if (!newManualShift.name || !newManualShift.start || !newManualShift.end || !newManualShift.date) return alert("Fill all fields");
    await supabase.from('manual_shifts').insert({ staff_name: newManualShift.name, start_time_str: newManualShift.start, end_time_str: newManualShift.end, team: newManualShift.team, shift_date: newManualShift.date });
    setShowManualModal(false); fetchData();
  };

  const submitAttendance = async (shift: any, type: string) => {
    if ((type === 'OTHER' || type === 'NO_SHOW') && !formNote.trim()) return alert("Note is mandatory.");
    setIsSaving(true);
    const timeFmt = (t: string) => {
        const [h, m] = t.split(':');
        const hours = parseInt(h);
        return `${hours % 12 || 12}:${m} ${hours >= 12 ? 'pm' : 'am'}`;
    };
    const newTime = type.startsWith('EDIT') ? timeFmt(formTime) : null;
    const { error } = await supabase.from('attendance_logs').insert({
      shift_id: shift.Id.toString(), staff_name: shift._DPMetaData?.EmployeeInfo?.DisplayName,
      action_type: type, notes: (type === 'LATE' || type === 'ON_TIME') ? "" : formNote,
      override_start: type === 'EDIT_START' ? newTime : null, override_end: type === 'EDIT_END' ? newTime : null
    });
    if (!error) { setActiveForm(null); setFormNote(""); setFormTime(""); await fetchData(); }
    setIsSaving(false);
  };

  const exportToCSV = () => {
    const headers = ["Date", "Name", "Start", "End", "Status", "Notes", "Coffee (kg)"];
    const rows = shifts.map(s => {
      const logs = attendanceLogs.filter(l => l.shift_id.toString() === s.Id.toString());
      const status = logs.find(l => !l.action_type.startsWith('EDIT'));
      const sE = logs.find(l => l.action_type === 'EDIT_START')?.override_start;
      const eE = logs.find(l => l.action_type === 'EDIT_END')?.override_end;
      const dStr = s.IsManual ? s.Date : new Date(s.StartTime * 1000).toISOString().split('T')[0];
      const c = coffeeStats.find(cs => cs.date === dStr && cs.is_confirmed)?.coffee_total || 0;
      return [new Date(s.StartTime * 1000 || s.Date).toLocaleDateString(), `"${s._DPMetaData?.EmployeeInfo?.DisplayName}"`, sE || "Sched", eE || "Sched", status?.action_type || "PENDING", `"${status?.notes || ""}"`, c].join(",");
    });
    const link = document.createElement("a");
    link.href = encodeURI("data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n"));
    link.download = `Log_${selectedDate}.csv`;
    link.click();
  };

  // --- 5. RENDER HELPERS ---
  const renderTimeDisplay = (s: any, isCompact = false) => {
    const logs = attendanceLogs.filter(l => l.shift_id.toString() === s.Id.toString());
    const sE = logs.find(l => l.action_type === 'EDIT_START');
    const eE = logs.find(l => l.action_type === 'EDIT_END');
    const oS = getDeputyFmt(s.StartTime); const oE = getDeputyFmt(s.EndTime);

    return (
      <div className={`${isCompact ? 'text-[9px] print:text-[7pt]' : 'text-lg'} font-bold flex flex-wrap gap-1 items-center print:text-black`}>
        <button onClick={(e) => {e.stopPropagation(); setActiveForm({id: s.Id, type: 'EDIT_START'})}} className="hover:underline">
            {sE && sE.override_start !== oS ? <><span className="line-through text-slate-300 print:text-slate-400">{oS}</span> <span className="text-blue-600 font-black">({sE.override_start})</span></> : <span className="text-orange-600 print:text-black">{oS}</span>}
        </button>
        <span>—</span>
        <button onClick={(e) => {e.stopPropagation(); setActiveForm({id: s.Id, type: 'EDIT_END'})}} className="hover:underline">
            {eE && eE.override_end !== oE ? <><span className="line-through text-slate-300 print:text-slate-400">{oE}</span> <span className="text-blue-600 font-black">({eE.override_end})</span></> : <span className="text-orange-600 print:text-black">{oE}</span>}
        </button>
      </div>
    );
  };

  // --- 6. MAIN PAGE RENDER ---
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 pb-20 font-sans print:bg-white print:p-0 text-left">
      <style jsx global>{` @media print { @page { size: A4 portrait; margin: 0.2cm; } body { background: white !important; font-size: 8pt; } .no-print, header { display: none !important; } * { -webkit-print-color-adjust: exact !important; } } `}</style>

      <div className="max-w-5xl mx-auto print:max-w-none print:w-full">
        <header className="bg-white p-6 rounded-3xl shadow-sm mb-8 border border-slate-200 flex flex-col lg:flex-row justify-between items-center gap-6 print:hidden text-left">
          <div className="flex-1">
            <h1 className="text-3xl font-black uppercase italic tracking-tighter">Martin Place Log</h1>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setViewMode('daily')} className={`px-8 py-2.5 rounded-full text-xs font-black uppercase transition-all shadow-sm ${viewMode === 'daily' ? 'bg-slate-800 text-white scale-105' : 'bg-slate-100 text-slate-400'}`}>Daily View</button>
              <button onClick={() => setViewMode('weekly')} className={`px-8 py-2.5 rounded-full text-xs font-black uppercase transition-all shadow-sm ${viewMode === 'weekly' ? 'bg-slate-800 text-white scale-105' : 'bg-slate-100 text-slate-400'}`}>Weekly View</button>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {viewMode === 'daily' && (
              <div className={`p-3 rounded-2xl flex items-center gap-3 transition-colors ${isCoffeeConfirmed ? 'bg-green-50 border-2 border-green-200' : 'bg-orange-50 border border-orange-200'}`}>
                <div className="flex flex-col items-center">
                    <span className="text-[8px] font-black text-slate-400 uppercase">Standard</span>
                    <input disabled={isCoffeeConfirmed || isSaving} type="number" placeholder="10" value={coffeeStandard} onChange={e => {setCoffeeStandard(e.target.value); setIsCoffeeConfirmed(false);}} className="w-12 p-1 rounded-lg text-center bg-white font-bold outline-none" />
                </div>
                <button disabled={isCoffeeConfirmed || isSaving} onClick={() => {setCoffeeOperator(coffeeOperator === '+' ? '-' : '+'); setIsCoffeeConfirmed(false);}} className={`w-8 h-8 rounded-full bg-slate-200 font-black`}>{coffeeOperator}</button>
                <div className="flex flex-col items-center">
                    <span className="text-[8px] font-black text-slate-400 uppercase">Extra</span>
                    <input disabled={isCoffeeConfirmed || isSaving} type="number" value={coffeeExtra} placeholder="0" onChange={e => {setCoffeeExtra(e.target.value); setIsCoffeeConfirmed(false);}} className="w-12 p-1 rounded-lg text-center bg-white font-bold outline-none" />
                </div>
                <button disabled={isSaving} onClick={handleConfirmCoffee} className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase shadow-md transition-all ${isCoffeeConfirmed ? 'bg-green-600 text-white' : 'bg-orange-600 text-white hover:scale-105'}`}>{isSaving ? '...' : (isCoffeeConfirmed ? 'Confirmed' : 'Confirm')}</button>
              </div>
            )}
            <button onClick={() => { setNewManualShift({ name: '', start: '', end: '', team: 'FOH Team', date: viewMode === 'daily' ? selectedDate : '' }); setShowManualModal(true); }} className="bg-slate-900 text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase shadow-lg">+ Create Shift</button>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="p-3 border-2 border-slate-200 rounded-2xl font-bold bg-white" />
          </div>
        </header>

        {viewMode === 'weekly' && (
          <div className="animate-in slide-in-from-top-4 duration-500 text-left">
            <div className="hidden print:block border-b-2 border-slate-900 pb-1 mb-2">
                <h1 className="text-[12pt] font-black uppercase italic italic text-left">Martin Place Log</h1>
                <p className="text-[7pt] font-bold">Week: {new Date(weekRange.mon).toLocaleDateString()} — {new Date(weekRange.sun).toLocaleDateString()} | Total Weekly Coffee: {confirmedWeeklyCoffeeTotal.toFixed(1)}kg</p>
                <div className="flex gap-3 mt-1 text-[6pt] font-black text-slate-500">
                    {weekRange.days.map((d, i) => <span key={d}>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}: {(coffeeStats.find(cs => cs.date === d && cs.is_confirmed)?.coffee_total || 0).toFixed(1)}kg</span>)}
                </div>
            </div>
            <div className="mb-4 bg-slate-800 text-white p-6 rounded-3xl shadow-lg flex justify-between items-center print:hidden">
               <div className="text-left"><p className="text-[10px] font-black text-slate-400 uppercase mb-1">Business Week</p><p className="text-lg font-bold">{new Date(weekRange.mon).toLocaleDateString()} — {new Date(weekRange.sun).toLocaleDateString()}</p></div>
               <div className="text-right"><p className="text-[10px] font-black text-orange-400 uppercase mb-1">Weekly Coffee Total</p><p className="text-4xl font-black text-orange-500">{confirmedWeeklyCoffeeTotal.toFixed(1)} <span className="text-sm">KG</span></p></div>
            </div>
            <div className="grid grid-cols-7 gap-2 mb-8 px-2 print:hidden">
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day, i) => (
                    <div key={day} className="text-center">
                        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{day}</p>
                        <div className="bg-white border border-slate-200 rounded-lg p-2 shadow-sm font-black text-xs">{(coffeeStats.find(c => c.date === weekRange.days[i] && c.is_confirmed)?.coffee_total || 0).toFixed(1)}kg</div>
                    </div>
                ))}
            </div>
            <div className="flex justify-end gap-2 mb-4 print:hidden"><button onClick={exportToCSV} className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase">CSV</button><button onClick={() => window.print()} className="bg-orange-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-md">Print Report</button></div>
          </div>
        )}

        {[ {id: "FOH Team", name: "Front of House", col: "bg-slate-800"}, {id: "BOH Team", name: "Back of House", col: "bg-orange-600"} ].map(team => (
          <div key={team.id} className="mb-10 text-left">
            <h2 className={`text-xs font-black text-white ${team.col} px-5 py-1.5 inline-block rounded-t-xl uppercase ml-2 tracking-widest print:text-[8pt] print:text-black print:bg-slate-100 print:ml-0 print:w-full`}>{team.name}</h2>
            <div className={`border-t-4 ${team.col.replace('bg-', 'border-')} pt-6 print:border-none print:pt-1`}>
                {Array.from(new Set(shifts.filter(s => s._DPMetaData?.OperationalUnitInfo?.OperationalUnitName === team.id).map(s => s._DPMetaData.EmployeeInfo.DisplayName))).map(empName => {
                    const staffShifts = shifts.filter(s => s._DPMetaData.EmployeeInfo.DisplayName === empName && s._DPMetaData.OperationalUnitInfo.OperationalUnitName === team.id);
                    if (viewMode === 'daily') {
                        return staffShifts.filter(s => (s.StartTimeLocalized?.includes(selectedDate) || s.Date === selectedDate)).map(s => {
                            const log = getLatestLog(s.Id);
                            const isSel = activeForm?.id === s.Id;
                            return (
                                <div key={s.Id} className={`bg-white p-5 rounded-2xl shadow-sm border mb-4 ${log ? STATUS_COLORS[log.action_type].border : 'border-slate-200'}`}>
                                    <div className="flex justify-between items-center gap-4 text-left">
                                        <div className="flex-1 text-left"><h2 className="text-2xl font-black uppercase leading-none">{empName}</h2><div className="mt-2 text-left">{renderTimeDisplay(s)}</div></div>
                                        <div className="flex flex-wrap gap-1 print:hidden">{['ON_TIME', 'LATE', 'NO_SHOW', 'OTHER'].map(type => (
                                            <button key={type} onClick={() => (type === 'NO_SHOW' || type === 'OTHER') ? setActiveForm({id: s.Id, type}) : submitAttendance(s, type)} className={`px-3 py-2 rounded-lg font-bold text-[9px] uppercase ${log?.action_type === type ? STATUS_COLORS[type].bg + " text-white scale-110" : "bg-slate-100 text-slate-400 opacity-40 hover:opacity-100"}`}>{type.replace('_',' ')}</button>
                                        ))}</div>
                                    </div>
                                    {log && <div className={`mt-4 p-3 rounded-xl border text-xs ${STATUS_COLORS[log.action_type].light} ${STATUS_COLORS[log.action_type].text} text-left`}><strong>{log.action_type.replace('_',' ')}:</strong> {log.notes}</div>}
                                    {isSel && activeForm && (
                                        <div className="mt-4 p-5 bg-slate-800 rounded-2xl shadow-xl animate-in zoom-in-95 text-left">
                                            <h4 className="text-orange-400 text-[10px] font-bold uppercase mb-4 tracking-widest">{activeForm.type} Details</h4>
                                            {activeForm.type.startsWith('EDIT') ? <input type="time" className="w-full p-4 rounded-xl bg-white" value={formTime} onChange={e => setFormTime(e.target.value)} />
                                            : <textarea autoFocus placeholder={activeForm.type === 'LATE' ? 'Note (Optional)' : 'Reason (Mandatory)'} className="w-full p-4 rounded-xl" value={formNote} onChange={e => setFormNote(e.target.value)} />}
                                            <div className="flex gap-2 mt-3"><button disabled={isSaving} onClick={() => activeForm && submitAttendance(s, activeForm.type)} className="flex-1 bg-white text-slate-900 p-3 rounded-xl font-black uppercase text-xs">Save Change</button><button onClick={() => setActiveForm(null)} className="px-6 bg-slate-600 text-white rounded-xl font-bold text-xs uppercase">Cancel</button></div>
                                        </div>
                                    )}
                                </div>
                            );
                        });
                    } else {
                        // WEEKLY VIEW
                        return (
                            <div key={empName} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-6 print:mb-1 print:p-0 print:border-none print:shadow-none print:bg-transparent page-break-inside-avoid text-left">
                                <h3 className="text-xl font-black text-slate-800 uppercase border-b pb-3 mb-4 tracking-tighter print:text-[8pt] print:mb-0.5 print:pb-0.5 print:text-left">{empName}</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-3 mb-2 print:grid-cols-7 print:gap-0">
                                    {weekRange.days.map(dStr => {
                                        const dShift = staffShifts.find(sh => (sh.IsManual ? sh.Date === dStr : new Date(sh.StartTime * 1000).toISOString().split('T')[0] === dStr));
                                        if (!dShift) return <div key={dStr} className="min-h-[140px] bg-slate-50/50 rounded-xl border border-dashed border-slate-100 print:hidden"></div>;
                                        const dLog = getLatestLog(dShift.Id);
                                        const isGridSel = activeForm?.id === dShift.Id;
                                        return (
                                            <div key={dStr} onClick={() => !isSaving && setActiveForm({id: dShift.Id, type: 'MARK'})} className={`p-3 rounded-xl border text-center flex flex-col justify-between min-h-[140px] cursor-pointer print:min-h-0 print:p-1 print:rounded-none ${isGridSel ? 'ring-4 ring-orange-500 border-orange-500 z-10' : (dLog ? `${STATUS_COLORS[dLog.action_type].light} ${STATUS_COLORS[dLog.action_type].border}` : 'bg-slate-50 border-slate-100')}`}>
                                                <div><p className="text-[9px] font-black text-slate-400 uppercase leading-none mb-2 print:text-[5pt] print:mb-0">{new Date(dStr).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric' })}</p>{renderTimeDisplay(dShift, true)}</div>
                                                {dLog && (<div className={`mt-2 pt-2 border-t ${STATUS_COLORS[dLog.action_type].border} print:mt-0`}><p className={`text-[9px] font-black ${STATUS_COLORS[dLog.action_type].text} uppercase leading-none mb-1 print:text-[6pt]`}>{dLog.action_type}</p>{dLog.notes && <p className="text-[8px] text-slate-500 italic leading-tight line-clamp-3 print:text-[5pt] print:line-clamp-none">"{dLog.notes}"</p>}</div>)}
                                            </div>
                                        );
                                    })}
                                </div>
                                {activeForm && staffShifts.some(sh => sh.Id === activeForm.id) && (
                                    <div className="mt-4 p-4 bg-slate-50 rounded-xl border-2 border-slate-200 print:hidden text-left">
                                       <div className="flex flex-col sm:flex-row justify-between items-center gap-4"><p className="text-[10px] font-black text-slate-500 uppercase">Correction Menu</p>
                                       <div className="flex flex-wrap gap-1">{['ON_TIME', 'LATE', 'NO_SHOW', 'OTHER'].map(type => (
                                        <button key={type} onClick={() => (type === 'NO_SHOW' || type === 'OTHER') ? setActiveForm({id: activeForm.id, type}) : submitAttendance(staffShifts.find(sh => sh.Id === activeForm.id), type)} className={`px-3 py-2 rounded-lg font-bold text-[9px] uppercase ${getLatestLog(activeForm.id)?.action_type === type ? STATUS_COLORS[type].bg + " text-white scale-110" : "bg-white text-slate-400 opacity-40 shadow-sm"}`}>{type.replace('_',' ')}</button>
                                       ))}</div></div>
                                       {activeForm.type !== 'MARK' && (
                                            <div className="mt-4 p-5 bg-slate-800 rounded-2xl shadow-xl animate-in zoom-in-95 text-left">
                                                <h4 className="text-orange-400 text-[10px] font-bold uppercase mb-4 tracking-widest">{activeForm.type}</h4>
                                                {activeForm.type.startsWith('EDIT') ? <input type="time" className="w-full p-4 rounded-xl bg-white text-slate-900 font-black text-2xl" value={formTime} onChange={e => setFormTime(e.target.value)} /> 
                                                : <textarea autoFocus placeholder="Reason..." className="w-full p-4 rounded-xl" value={formNote} onChange={e => setFormNote(e.target.value)} />}
                                                <div className="flex gap-2 mt-3"><button disabled={isSaving} onClick={() => activeForm && submitAttendance(staffShifts.find(sh => sh.Id === activeForm.id), activeForm.type)} className="flex-1 bg-white text-slate-900 p-3 rounded-xl font-black uppercase text-xs">Save</button><button onClick={() => setActiveForm(null)} className="px-6 bg-slate-600 text-white rounded-xl font-bold text-xs uppercase">Cancel</button></div>
                                            </div>
                                       )}
                                    </div>
                                )}
                            </div>
                        );
                    }
                })}
            </div>
          </div>
        ))}

        {showManualModal && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
                <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl text-left">
                    <h2 className="text-2xl font-black mb-6 uppercase italic">Add Temporary Shift</h2>
                    <div className="space-y-4 text-left">
                        <input placeholder="Staff Name" className="w-full p-4 border rounded-2xl outline-none" value={newManualShift.name} onChange={e => setNewManualShift({...newManualShift, name: e.target.value})} />
                        <input type="date" className="w-full p-4 border rounded-2xl outline-none" value={newManualShift.date} onChange={e => setNewManualShift({...newManualShift, date: e.target.value})} />
                        <div className="grid grid-cols-2 gap-4"><input placeholder="Start (7am)" className="p-4 border rounded-2xl outline-none" value={newManualShift.start} onChange={e => setNewManualShift({...newManualShift, start: e.target.value})} /><input placeholder="End (3pm)" className="p-4 border rounded-2xl outline-none" value={newManualShift.end} onChange={e => setNewManualShift({...newManualShift, end: e.target.value})} /></div>
                        <select className="w-full p-4 border rounded-2xl bg-white outline-none" value={newManualShift.team} onChange={e => setNewManualShift({...newManualShift, team: e.target.value})}><option>FOH Team</option><option>BOH Team</option></select>
                        <div className="flex gap-2 pt-2"><button onClick={handleCreateManual} className="flex-1 bg-slate-900 text-white p-4 rounded-2xl font-black uppercase text-xs shadow-lg">Create</button><button onClick={()=>setShowManualModal(false)} className="px-6 bg-slate-100 rounded-2xl uppercase text-xs font-bold">Cancel</button></div>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}