"use client";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import CoffeeTracker from './components/CoffeeTracker';
import ManualShiftModal from './components/ManualShiftModal';
import TimeDisplay from './components/TimeDisplay';
import PinModal from './components/PinModal';
import LogsOverlay from './components/LogsOverlay';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

const STATUS_COLORS: any = {
  ON_TIME: { bg: 'bg-green-600', border: 'border-green-200', text: 'text-green-700', light: 'bg-green-50' },
  LATE: { bg: 'bg-amber-500', border: 'border-amber-200', text: 'text-amber-700', light: 'bg-amber-50' },
  NO_SHOW: { bg: 'bg-red-600', border: 'border-red-200', text: 'text-red-700', light: 'bg-red-50' },
  OTHER: { bg: 'bg-slate-500', border: 'border-slate-200', text: 'text-slate-700', light: 'bg-slate-50' },
};

export default function MartinPlaceDashboard() {
  // --- HELPERS ---
  const getTodayDate = () => {
    const d = new Date();
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60 * 1000)).toISOString().split('T')[0];
  };

  const getLocalDateString = (val: any) => {
    if (!val) return "";
    if (typeof val === 'string' && val.includes('-')) return val.split('T')[0];
    const d = new Date(Number(val) * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const format24to12 = (t: string) => {
    if (!t || !t.includes(':')) return t;
    const [h, m] = t.split(':');
    return `${parseInt(h) % 12 || 12}:${m} ${parseInt(h) >= 12 ? 'pm' : 'am'}`;
  };

  // --- STATE ---
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');
  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [shifts, setShifts] = useState<any[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [coffeeStats, setCoffeeStats] = useState<any[]>([]);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Security
  const [showLogs, setShowLogs] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<any>(null);

  // Forms
  const [activeForm, setActiveForm] = useState<{id: any, type: string, name?: string} | null>(null);
  const [formTime, setFormTime] = useState("");
  const [formNote, setFormNote] = useState("");
  const [showManualModal, setShowManualModal] = useState(false);
  const [newManualShift, setNewManualShift] = useState({ name: '', start: '', end: '', team: 'FOH Team', date: '' });

  // Coffee
  const [coffeeStandard, setCoffeeStandard] = useState<string>("");
  const [coffeeExtra, setCoffeeExtra] = useState<string>("");
  const [coffeeOperator, setCoffeeOperator] = useState<'+' | '-'>('+');
  const [isCoffeeConfirmed, setIsCoffeeConfirmed] = useState<boolean>(false);

  // --- MEMOS ---
  const weekRange = useMemo(() => {
    const d = new Date(selectedDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d.setDate(diff));
    const days = Array.from({length: 7}, (_, i) => {
        const date = new Date(mon); date.setDate(date.getDate() + i);
        return date.toISOString().split('T')[0];
    });
    return { mon: days[0], sun: days[6], days };
  }, [selectedDate]);

  const confirmedWeeklyCoffeeTotal = useMemo(() => {
    return coffeeStats.filter(c => c.is_confirmed).reduce((sum, c) => sum + (c.coffee_total || 0), 0);
  }, [coffeeStats]);

  const getLatestLog = useCallback((id: any) => {
    if (!id || !attendanceLogs) return null;
    const log = attendanceLogs.find(l => l.shift_id.toString() === id.toString() && !l.action_type.startsWith('EDIT'));
    return (log && log.action_type !== 'RESET') ? log : null;
  }, [attendanceLogs]);

  // --- 1 WEEK LOCK LOGIC ---
  const isShiftLocked = (shiftDate: string) => {
    const now = new Date();
    const sydneyStr = now.toLocaleString("en-US", { timeZone: "Australia/Sydney", hour12: false });
    const sydneyNow = new Date(sydneyStr);
    const day = sydneyNow.getDay();
    const diff = sydneyNow.getDate() - day + (day === 0 ? -6 : 1);
    const thisMonday = new Date(sydneyNow.setDate(diff));
    thisMonday.setHours(0, 0, 0, 0);
    return new Date(shiftDate) < thisMonday;
  };

  const requestAuth = (shiftDate: string, action: () => Promise<void>) => {
    if (isShiftLocked(shiftDate)) {
      setPendingAction(() => action);
      setShowPinModal(true);
    } else { action(); }
  };

  const verifyPin = async (enteredPin: string) => {
    const { data } = await supabase.from('manager_config').select('pin').eq('key_name', 'master_pin').single();
    if (data?.pin === enteredPin) {
      setShowPinModal(false);
      if (pendingAction === 'SHOW_LOGS') setShowLogs(true);
      else if (typeof pendingAction === 'function') await pendingAction();
      setPendingAction(null);
    } else { alert("Incorrect PIN!"); }
  };

  // --- DATA FETCHING ---
  const fetchData = async (logsOnly = false) => {
    if (!logsOnly) setLoading(true);
    try {
      if (!logsOnly) {
        await fetch('/api/sync-deputy'); // Silent Sync
        const start = weekRange.mon;
        const end = weekRange.sun;

        const { data: mirror } = await supabase.from('deputy_shifts_mirror').select('*, deputy_employees(*), deputy_operational_units(*)').gte('shift_date', start).lte('shift_date', end);
        const { data: manual } = await supabase.from('manual_shifts').select('*').gte('shift_date', start).lte('shift_date', end).neq('status', 'removed');
        
        const formattedMirror = (mirror || []).map(m => ({
            Id: m.id, IsManual: false, StartTime: m.start_time, EndTime: m.end_time, Team: m.deputy_operational_units?.unit_name, Date: m.shift_date,
            _DPMetaData: { EmployeeInfo: { DisplayName: m.deputy_employees?.display_name }, OperationalUnitInfo: { OperationalUnitName: m.deputy_operational_units?.unit_name } }
        }));
        const formattedManual = (manual || []).map(m => ({ Id: `manual-${m.id}`, IsManual: true, StartTime: m.start_time_str, EndTime: m.end_time_str, Team: m.team, Date: m.shift_date, _DPMetaData: { EmployeeInfo: { DisplayName: m.staff_name }, OperationalUnitInfo: { OperationalUnitName: m.team } } }));

        setShifts([...formattedMirror, ...formattedManual]);
        const { data: coffee } = await supabase.from('daily_stats').select('*').gte('date', start).lte('date', end);
        setCoffeeStats(coffee || []);
        
        const todayC = (coffee || []).find(c => c.date === selectedDate);
        setCoffeeStandard(todayC?.coffee_standard?.toString() || "");
        setCoffeeExtra(todayC?.coffee_extra?.toString() || "");
        setCoffeeOperator(todayC?.coffee_operator || '+');
        setIsCoffeeConfirmed(todayC?.is_confirmed || false);
      }
      const { data: logs } = await supabase.from('attendance_logs').select('*').order('created_at', { ascending: false });
      const { data: sHistory } = await supabase.from('sync_history').select('*').order('sync_time', { ascending: false });
      setAttendanceLogs(logs || []);
      setSyncLogs(sHistory || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [selectedDate, viewMode]);

  // --- ACTIONS ---
  const handleConfirmCoffee = () => requestAuth(selectedDate, async () => {
    setIsSaving(true);
    const total = coffeeOperator === '+' ? (parseFloat(coffeeStandard)||10) + (parseFloat(coffeeExtra)||0) : (parseFloat(coffeeStandard)||10) - (parseFloat(coffeeExtra)||0);
    await supabase.from('daily_stats').upsert({ date: selectedDate, coffee_standard: parseFloat(coffeeStandard)||10, coffee_extra: parseFloat(coffeeExtra)||0, coffee_operator: coffeeOperator, coffee_total: isCoffeeConfirmed ? 0 : total, is_confirmed: !isCoffeeConfirmed });
    await fetchData(); setIsSaving(false);
  });

  const submitAttendance = (shiftId: string, name: string, type: string, shiftDate: string, origStart?: any) => requestAuth(shiftDate, async () => {
    const current = getLatestLog(shiftId);
    const finalType = (current?.action_type === type) ? 'RESET' : type;
    if (finalType !== 'RESET' && (finalType === 'OTHER' || finalType === 'NO_SHOW') && !formNote.trim()) return alert("Note is mandatory.");
    
    setIsSaving(true);
    const timeFmt = (t: string) => { if(!t.includes(':')) return t; const [h, m] = t.split(':'); return `${parseInt(h) % 12 || 12}:${m} ${parseInt(h) >= 12 ? 'pm' : 'am'}`; };
    const newTime = (type.startsWith('EDIT') || type === 'LATE') ? timeFmt(formTime) : null;

    await supabase.from('attendance_logs').insert({
      shift_id: shiftId, staff_name: name, action_type: finalType, notes: (finalType === 'NO_SHOW' || finalType === 'OTHER') ? formNote : "",
      override_start: (type === 'EDIT_START' || type === 'LATE') ? newTime : null, override_end: type === 'EDIT_END' ? newTime : null
    });

    if (type === 'EDIT_START' && origStart && formTime) {
        const [nH, nM] = formTime.split(':').map(Number);
        if ((nH * 60 + nM) > (new Date(origStart * 1000).getHours() * 60 + new Date(origStart * 1000).getMinutes())) {
            await supabase.from('attendance_logs').insert({ shift_id: shiftId, staff_name: name, action_type: 'LATE', notes: "" });
        }
    }
    setActiveForm(null); setFormNote(""); setFormTime(""); await fetchData(true); setIsSaving(false);
  });

  const handleCreateManual = () => requestAuth(newManualShift.date, async () => {
    const timeFmt = (t: string) => { if(!t.includes(':')) return t; const [h, m] = t.split(':'); return `${parseInt(h) % 12 || 12}:${m} ${parseInt(h) >= 12 ? 'pm' : 'am'}`; };
    await supabase.from('manual_shifts').insert({ staff_name: newManualShift.name, start_time_str: timeFmt(newManualShift.start), end_time_str: timeFmt(newManualShift.end), team: newManualShift.team, shift_date: newManualShift.date, status: 'active' });
    setShowManualModal(false); fetchData();
  });

  const handleRemoveManual = (id: any, date: string) => requestAuth(date, async () => {
    if (confirm("Remove shift?")) {
        await supabase.from('manual_shifts').update({ status: 'removed' }).eq('id', id.toString().replace('manual-',''));
        fetchData();
    }
  });

  const exportToCSV = () => {
    const headers = ["Date", "Name", "Start", "End", "Status", "Notes", "Coffee"];
    const rows = shifts.map(s => {
      const logs = attendanceLogs.filter(l => l.shift_id.toString() === s.Id.toString());
      const status = logs.find(l => !l.action_type.startsWith('EDIT') && l.action_type !== 'RESET');
      const dStr = s.IsManual ? s.Date : new Date(s.StartTime * 1000).toISOString().split('T')[0];
      return [new Date(s.StartTime * 1000 || s.Date).toLocaleDateString(), s._DPMetaData.EmployeeInfo.DisplayName, "Sched", "Sched", status?.action_type || "PENDING", `"${status?.notes || ""}"`, (coffeeStats.find(cs => cs.date === dStr && cs.is_confirmed)?.coffee_total || 0).toFixed(1)].join(",");
    });
    window.open(encodeURI("data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n")));
  };

  const getCoffeeForDate = (dateStr: string) => {
    const stat = coffeeStats.find(c => c.date === dateStr && c.is_confirmed);
    return stat ? `${stat.coffee_total.toFixed(1)}kg` : "—";
  };

  // --- 7. RENDER ---
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 pb-20 font-sans print:bg-white print:p-0 text-left">
      <style jsx global>{` @media print { @page { size: A4 portrait; margin: 0.2cm; } body { background: white !important; font-size: 8pt; } .no-print, header { display: none !important; } * { -webkit-print-color-adjust: exact !important; } } `}</style>

      {showPinModal && <PinModal onVerify={verifyPin} onClose={() => {setShowPinModal(false); setPendingAction(null);}} />}
      {showLogs && <LogsOverlay syncLogs={syncLogs} activityLogs={attendanceLogs} onClose={() => setShowLogs(false)} />}

      <div className="max-w-5xl mx-auto print:max-w-none print:w-full">
        {/* HEADER */}
        <header className="bg-white p-6 rounded-3xl shadow-sm mb-8 border border-slate-200 flex flex-col lg:flex-row justify-between items-center gap-6 print:hidden">
          <div className="flex-1 text-left"><h1 className="text-3xl font-black uppercase italic tracking-tighter">Martin Place Log</h1>
            <div className="flex gap-2 mt-4 text-left">
              <button onClick={() => {setViewMode('daily'); setActiveForm(null);}} className={`px-8 py-2.5 rounded-full text-xs font-black uppercase transition-all shadow-sm ${viewMode === 'daily' ? 'bg-slate-800 text-white scale-105' : 'bg-slate-100 text-slate-400'}`}>Daily</button>
              <button onClick={() => {setViewMode('weekly'); setActiveForm(null);}} className={`px-8 py-2.5 rounded-full text-xs font-black uppercase transition-all shadow-sm ${viewMode === 'weekly' ? 'bg-slate-800 text-white scale-105' : 'bg-slate-100 text-slate-400'}`}>Weekly</button>
              <button onClick={() => { setPendingAction('SHOW_LOGS'); setShowPinModal(true); }} className="px-6 py-2.5 rounded-full text-xs font-black uppercase bg-slate-100 text-slate-400 hover:text-slate-900">View Logs</button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {viewMode === 'daily' && <CoffeeTracker standard={coffeeStandard} extra={coffeeExtra} operator={coffeeOperator} confirmed={isCoffeeConfirmed} onConfirm={handleConfirmCoffee} setStandard={setCoffeeStandard} setExtra={setCoffeeExtra} setOp={setCoffeeOperator} isSaving={isSaving} />}
            <button onClick={() => { setNewManualShift({ name: '', start: '', end: '', team: 'FOH Team', date: selectedDate }); setShowManualModal(true); }} className="bg-slate-900 text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase shadow-lg hover:bg-orange-600 transition-colors">+ Create Shift</button>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="p-3 border-2 border-slate-200 rounded-2xl font-bold bg-white text-slate-900 shadow-sm" />
          </div>
        </header>

        {viewMode === 'weekly' && (
          <div className="animate-in slide-in-from-top-4 duration-500">
            <div className="hidden print:block border-b-2 border-slate-900 pb-1 mb-2 text-left">
                <h1 className="text-[12pt] font-black uppercase italic italic text-left">Martin Place Log</h1>
                <p className="text-[7pt] font-bold">Week: {new Date(weekRange.mon).toLocaleDateString()} — {new Date(weekRange.sun).toLocaleDateString()} | Coffee: {confirmedWeeklyCoffeeTotal.toFixed(1)}kg</p>
                <div className="flex gap-3 mt-1 text-[6pt] font-black text-slate-500 uppercase">{weekRange.days.map((d, i) => <span key={d}>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}: {getCoffeeForDate(d)}</span>)}</div>
            </div>
            <div className="mb-4 bg-slate-800 text-white p-6 rounded-3xl shadow-lg flex justify-between items-center print:hidden text-left">
               <div className="text-left"><p className="text-[10px] font-black text-slate-400 uppercase mb-1">Business Week</p><p className="text-lg font-bold">{new Date(weekRange.mon).toLocaleDateString()} — {new Date(weekRange.sun).toLocaleDateString()}</p></div>
               <div className="text-right"><p className="text-[10px] font-black text-orange-400 uppercase mb-1">Weekly Total</p><p className="text-4xl font-black text-orange-500 print:text-black print:text-xl">{confirmedWeeklyCoffeeTotal.toFixed(1)} <span className="text-sm uppercase">KG</span></p></div>
            </div>
            <div className="grid grid-cols-7 gap-2 mb-8 px-2 print:hidden text-center">
                {weekRange.days.map((day, idx) => (<div key={day} className="text-center"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][idx]}</p><div className="bg-white border border-slate-200 rounded-lg p-2 shadow-sm font-black text-xs text-slate-900">{getCoffeeForDate(day)}</div></div>))}
            </div>
            <div className="flex justify-end gap-2 mb-4 print:hidden text-left"><button onClick={exportToCSV} className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-sm">CSV</button><button onClick={() => window.print()} className="bg-orange-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-md">Print PDF</button></div>
          </div>
        )}

        {[ {id: "FOH Team", name: "Front of House", col: "bg-slate-800"}, {id: "BOH Team", name: "Back of House", col: "bg-orange-600"} ].map(team => {
            const teamShifts = shifts.filter(s => s._DPMetaData?.OperationalUnitInfo?.OperationalUnitName === team.id);
            const distinctNames = Array.from(new Set(teamShifts.map(s => s._DPMetaData.EmployeeInfo.DisplayName))).sort();
            return (
                <div key={team.id} className="mb-10 text-left">
                    <h2 className={`text-xs font-black text-white ${team.col} px-5 py-1.5 inline-block rounded-t-xl uppercase ml-2 tracking-widest print:text-black print:bg-slate-100 print:ml-0 print:w-full`}>{team.name}</h2>
                    <div className={`border-t-4 ${team.col.replace('bg-', 'border-')} pt-6 print:border-none print:pt-1`}>
                        {viewMode === 'daily' ? (
                            teamShifts.filter(s => (getLocalDateString(s.IsManual ? s.Date : s.StartTime) === selectedDate)).map(s => {
                                const log = getLatestLog(s.Id);
                                return (
                                    <div key={s.Id} className={`bg-white p-5 rounded-2xl shadow-sm border mb-4 ${log ? STATUS_COLORS[log.action_type].border : 'border-slate-200'}`}>
                                        <div className="flex justify-between items-center gap-4 text-left">
                                            <div className="flex-1 text-left"><div className="flex items-center gap-3"><h2 className="text-2xl font-black uppercase leading-none">{s._DPMetaData.EmployeeInfo.DisplayName}</h2>{s.IsManual && <button onClick={()=>handleRemoveManual(s.Id, selectedDate)} className="text-[8px] text-red-500 font-bold px-2 py-1 rounded bg-red-50 hover:bg-red-500 hover:text-white transition-colors">Remove</button>}</div><div className="mt-2 text-left"><TimeDisplay s={s} logs={attendanceLogs} onEdit={(id: any, type: string) => setActiveForm({id, type, name: s._DPMetaData.EmployeeInfo.DisplayName})} /></div></div>
                                            <div className="flex flex-wrap gap-1 print:hidden">{['ON_TIME', 'LATE', 'NO_SHOW', 'OTHER'].map(type => (
                                                <button key={type} onClick={() => { if(type==='NO_SHOW'||type==='OTHER'||type==='LATE') setActiveForm({id:s.Id, type, name:s._DPMetaData.EmployeeInfo.DisplayName}); else submitAttendance(s.Id.toString(), s._DPMetaData.EmployeeInfo.DisplayName, type, selectedDate, s.StartTime); }} className={`px-3 py-2 rounded-lg font-bold text-[9px] uppercase ${log?.action_type === type ? STATUS_COLORS[type].bg + " text-white scale-110" : "bg-slate-100 text-slate-400 opacity-40 hover:opacity-100"}`}>{type.replace('_',' ')}</button>
                                            ))}</div>
                                        </div>
                                        {log && <div className={`mt-4 p-3 rounded-xl border text-xs ${STATUS_COLORS[log.action_type].light} ${STATUS_COLORS[log.action_type].text} text-left`}><strong>{log.action_type.replace('_',' ')}:</strong> {log.notes}</div>}
                                    </div>
                                );
                            })
                        ) : (
                            distinctNames.map(name => {
                                const staffShifts = teamShifts.filter(s => s._DPMetaData.EmployeeInfo.DisplayName === name);
                                return (
                                    <div key={name} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-6 print:mb-1 print:p-0 print:border-none print:shadow-none print:bg-transparent page-break-inside-avoid text-left">
                                        <h3 className="text-xl font-black text-slate-800 uppercase border-b pb-3 mb-4 tracking-tighter print:text-[8pt] print:mb-0.5 print:pb-0.5 print:border-slate-200 print:text-left">{name}</h3>
                                        <div className="grid grid-cols-7 gap-3 mb-2 print:grid-cols-7 print:gap-0">
                                            {weekRange.days.map(dStr => {
                                                const dShift = staffShifts.find(sh => (getLocalDateString(sh.IsManual ? sh.Date : sh.StartTime) === dStr));
                                                if (!dShift) return <div key={dStr} className="min-h-[140px] bg-slate-50/20 border-slate-100 print:min-h-0 print:border-none"></div>;
                                                const dLog = getLatestLog(dShift.Id);
                                                return (
                                                    <div key={dStr} onClick={() => !isSaving && setActiveForm({id: dShift.Id, type: 'MARK', name})} className={`p-3 rounded-xl border text-center flex flex-col justify-between min-h-[140px] cursor-pointer print:min-h-0 print:p-1 print:rounded-none ${activeForm?.id === dShift.Id ? 'ring-4 ring-orange-500 border-orange-500 z-10 scale-105 shadow-xl' : (dLog ? `${STATUS_COLORS[dLog.action_type].light} ${STATUS_COLORS[dLog.action_type].border}` : 'bg-slate-50 border-slate-100')}`}>
                                                        <div><p className="text-[9px] font-black text-slate-400 uppercase leading-none mb-2 print:text-[5pt] print:mb-0">{new Date(dStr).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric' })}</p><TimeDisplay s={dShift} logs={attendanceLogs} isCompact onEdit={(id:any, type:string)=>setActiveForm({id, type, name})} /></div>
                                                        {dLog && (<div className={`mt-2 pt-2 border-t ${STATUS_COLORS[dLog.action_type].border} print:mt-0`}><p className={`text-[9px] font-black ${STATUS_COLORS[dLog.action_type].text} uppercase leading-none mb-1 print:text-[6pt]`}>{dLog.action_type.replace('_',' ')}</p>{dLog.notes && <p className="text-[8px] text-slate-500 italic leading-tight line-clamp-2 print:text-[5pt] print:line-clamp-none">"{dLog.notes}"</p>}</div>)}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            )
        })}

        {/* --- GLOBAL ACTION MODAL --- */}
        {activeForm && activeForm.type !== 'MARK' && (
            <div className="fixed inset-0 bg-black/40 z-[500] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm">
                <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg p-6 shadow-2xl animate-in slide-in-from-bottom duration-300 text-left">
                    <div className="flex justify-between items-center mb-6"><div><h4 className="font-black text-slate-800 uppercase tracking-widest">{activeForm.type.replace('_',' ')} DETAILS</h4><p className="text-[10px] font-bold text-slate-400 uppercase">Updating {activeForm.name}</p></div><button onClick={() => setActiveForm(null)} className="bg-slate-100 h-10 w-10 rounded-full text-slate-400 font-bold text-xl">×</button></div>
                    <div className="flex flex-col gap-4 text-left">
                        {(activeForm.type.startsWith('EDIT') || activeForm.type === 'LATE') && (<div className="bg-slate-50 p-4 rounded-2xl text-left"><label className="text-[10px] font-black uppercase text-slate-400 block mb-2 ml-1">Select Time</label><input type="time" className="w-full p-4 rounded-xl bg-white border-2 border-slate-100 text-slate-900 font-black text-2xl outline-none" value={formTime} onChange={e => setFormTime(e.target.value)} /></div>)}
                        {['NO_SHOW', 'OTHER'].includes(activeForm.type) && (<textarea autoFocus placeholder="Reason (Mandatory)..." className="w-full p-4 rounded-xl bg-slate-50 border-2 border-slate-100 outline-none h-32 text-slate-900" value={formNote} onChange={e => setFormNote(e.target.value)} />)}
                        <button disabled={isSaving} onClick={() => { const sh = shifts.find(sh => sh.Id.toString() === activeForm.id.toString()); submitAttendance(activeForm.id.toString(), activeForm.name || 'Staff', activeForm.type, getLocalDateString(sh?.IsManual ? sh.Date : sh?.StartTime), sh?.StartTime); }} className="w-full bg-slate-900 text-white p-5 rounded-2xl font-black uppercase text-xs shadow-lg">{isSaving ? 'Saving...' : 'Save Change'}</button>
                    </div>
                </div>
            </div>
        )}

        {showManualModal && <ManualShiftModal data={newManualShift} setData={setNewManualShift} onSave={handleCreateManual} onClose={()=>setShowManualModal(false)} existingShifts={shifts} />}
      </div>
    </div>
  );
}