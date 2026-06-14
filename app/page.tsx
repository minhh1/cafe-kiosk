"use client";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import CoffeeTracker from './components/CoffeeTracker';
import ManualShiftModal from './components/ManualShiftModal';
import TimeDisplay, { formatTime } from './components/TimeDisplay';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  const [shifts, setShifts] = useState<any[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [coffeeStats, setCoffeeStats] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');
  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form & Modals
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

  // --- MEMOIZED DATA ---
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

  const confirmedWeeklyCoffeeTotal = useMemo(() => coffeeStats.filter(c => c.is_confirmed).reduce((sum, c) => sum + (c.coffee_total || 0), 0), [coffeeStats]);

  const getLatestLog = useCallback((id: any) => {
    if (!id || !attendanceLogs) return null;
    const log = attendanceLogs.find(l => l.shift_id.toString() === id.toString() && !l.action_type.startsWith('EDIT'));
    return (log && log.action_type !== 'RESET') ? log : null;
  }, [attendanceLogs]);

  // --- DATA FETCHING ---
  const fetchData = async (logsOnly = false) => {
    if (!logsOnly) setLoading(true);
    try {
      const { data: logs } = await supabase.from('attendance_logs').select('*').order('created_at', { ascending: false });
      setAttendanceLogs(logs || []);

      if (!logsOnly) {
        const rosterRes = await fetch(`/api/roster?startDate=${viewMode === 'daily' ? selectedDate : weekRange.mon}&endDate=${viewMode === 'daily' ? selectedDate : weekRange.sun}`);
        const rosterData = await rosterRes.json();
        const { data: manualData } = await supabase.from('manual_shifts').select('*').gte('shift_date', weekRange.mon).lte('shift_date', weekRange.sun).neq('status', 'removed');
        
        const formattedManual = (manualData || []).map(m => ({
          Id: `manual-${m.id}`, IsManual: true, StartTime: m.start_time_str, EndTime: m.end_time_str, Team: m.team, Date: m.shift_date,
          _DPMetaData: { EmployeeInfo: { DisplayName: m.staff_name }, OperationalUnitInfo: { OperationalUnitName: m.team } }
        }));

        setShifts([...(Array.isArray(rosterData) ? rosterData : []), ...formattedManual]);
        const { data: coffee } = await supabase.from('daily_stats').select('*').gte('date', weekRange.mon).lte('date', weekRange.sun);
        setCoffeeStats(coffee || []);
        
        const todayC = (coffee || []).find(c => c.date === selectedDate);
        setCoffeeStandard(todayC?.coffee_standard?.toString() || "");
        setCoffeeExtra(todayC?.coffee_extra?.toString() || "");
        setCoffeeOperator(todayC?.coffee_operator || '+');
        setIsCoffeeConfirmed(todayC?.is_confirmed || false);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [selectedDate, viewMode]);

  // --- ACTIONS ---
  const handleConfirmCoffee = async () => {
    setIsSaving(true);
    const std = parseFloat(coffeeStandard) || 10;
    const ext = parseFloat(coffeeExtra) || 0;
    const total = coffeeOperator === '+' ? std + ext : std - ext;
    await supabase.from('daily_stats').upsert({ date: selectedDate, coffee_standard: std, coffee_extra: ext, coffee_operator: coffeeOperator, coffee_total: isCoffeeConfirmed ? 0 : total, is_confirmed: !isCoffeeConfirmed });
    await fetchData(); setIsSaving(false);
  };

  const handleCreateManual = async () => {
    await supabase.from('manual_shifts').insert({ staff_name: newManualShift.name, start_time_str: format24to12(newManualShift.start), end_time_str: format24to12(newManualShift.end), team: newManualShift.team, shift_date: newManualShift.date, status: 'active' });
    setShowManualModal(false); fetchData();
  };

  const handleRemoveManual = async (id: any) => {
    if (confirm("Remove shift?")) {
        await supabase.from('manual_shifts').update({ status: 'removed' }).eq('id', id.toString().replace('manual-',''));
        fetchData();
    }
  };

  const submitAttendance = async (shiftId: string, name: string, type: string, origStart?: any) => {
    const current = getLatestLog(shiftId);
    const finalType = (current?.action_type === type) ? 'RESET' : type;

    // MANDATORY NOTE CHECK
    if (finalType !== 'RESET' && (finalType === 'OTHER' || finalType === 'NO_SHOW') && !formNote.trim()) {
        return alert("Error: A note is required for No Show or Other status.");
    }
    
    setIsSaving(true);
    const timeFmt = (t: string) => { if(!t.includes(':')) return t; const [h, m] = t.split(':'); return `${parseInt(h) % 12 || 12}:${m} ${parseInt(h) >= 12 ? 'pm' : 'am'}`; };
    const newTime = type.startsWith('EDIT') ? timeFmt(formTime) : null;

    const { error } = await supabase.from('attendance_logs').insert({
      shift_id: shiftId, staff_name: name,
      action_type: finalType, notes: (finalType === 'NO_SHOW' || finalType === 'OTHER') ? formNote : "",
      override_start: type === 'EDIT_START' ? newTime : null, override_end: type === 'EDIT_END' ? newTime : null
    });

    if (!error && type === 'EDIT_START' && origStart && formTime) {
        const orig = new Date(origStart * 1000);
        const [nH, nM] = formTime.split(':').map(Number);
        if ((nH * 60 + nM) > (orig.getHours() * 60 + orig.getMinutes())) {
            await supabase.from('attendance_logs').insert({ shift_id: shiftId, staff_name: name, action_type: 'LATE', notes: "" });
        }
    }
    setActiveForm(null); setFormNote(""); setFormTime(""); await fetchData(true); setIsSaving(false);
  };

  // --- RENDER LOGIC ---
  const getCoffeeForDate = (dateStr: string) => {
    const stat = coffeeStats.find(c => c.date === dateStr && c.is_confirmed);
    return stat ? `${stat.coffee_total.toFixed(1)}kg` : "—";
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 pb-20 font-sans print:bg-white print:p-0 text-left">
      <style jsx global>{` @media print { @page { size: A4 portrait; margin: 0.2cm; } body { background: white !important; font-size: 8pt; } .no-print, header { display: none !important; } * { -webkit-print-color-adjust: exact !important; } } `}</style>

      <div className="max-w-5xl mx-auto print:max-w-none print:w-full">
        {/* HEADER */}
        <header className="bg-white p-6 rounded-3xl shadow-sm mb-8 border border-slate-200 flex flex-col lg:flex-row justify-between items-center gap-6 print:hidden">
          <div className="flex-1 text-left">
            <h1 className="text-3xl font-black uppercase italic tracking-tighter">Martin Place Log</h1>
            <div className="flex gap-2 mt-4 text-left">
              <button onClick={() => {setViewMode('daily'); setActiveForm(null);}} className={`px-8 py-2.5 rounded-full text-xs font-black uppercase transition-all shadow-sm ${viewMode === 'daily' ? 'bg-slate-800 text-white scale-105' : 'bg-slate-100 text-slate-400'}`}>Daily View</button>
              <button onClick={() => {setViewMode('weekly'); setActiveForm(null);}} className={`px-8 py-2.5 rounded-full text-xs font-black uppercase transition-all shadow-sm ${viewMode === 'weekly' ? 'bg-slate-800 text-white scale-105' : 'bg-slate-100 text-slate-400'}`}>Weekly View</button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {viewMode === 'daily' && <CoffeeTracker standard={coffeeStandard} extra={coffeeExtra} operator={coffeeOperator} confirmed={isCoffeeConfirmed} onConfirm={handleConfirmCoffee} setStandard={setCoffeeStandard} setExtra={setCoffeeExtra} setOp={setCoffeeOperator} isSaving={isSaving} />}
            <button onClick={() => { setNewManualShift({ name: '', start: '', end: '', team: 'FOH Team', date: selectedDate }); setShowManualModal(true); }} className="bg-slate-900 text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase shadow-lg hover:bg-orange-600 transition-colors">+ Create Shift</button>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="p-3 border-2 border-slate-200 rounded-2xl font-bold bg-white text-slate-900 shadow-sm" />
          </div>
        </header>

        {/* TEAM SECTIONS */}
        {[ {id: "FOH Team", name: "Front of House", col: "bg-slate-800"}, {id: "BOH Team", name: "Back of House", col: "bg-orange-600"} ].map(team => {
            const teamShifts = shifts.filter(s => s._DPMetaData?.OperationalUnitInfo?.OperationalUnitName === team.id);
            return (
                <div key={team.id} className="mb-10 text-left">
                    <h2 className={`text-xs font-black text-white ${team.col} px-5 py-1.5 inline-block rounded-t-xl uppercase ml-2 tracking-widest print:text-black print:bg-slate-100 print:ml-0 print:w-full`}>{team.name}</h2>
                    <div className={`border-t-4 ${team.col.replace('bg-', 'border-')} pt-6 print:border-none print:pt-1`}>
                        {viewMode === 'daily' ? (
                            teamShifts.filter(s => (getLocalDateString(s.IsManual ? s.Date : s.StartTime) === selectedDate)).map(s => {
                                const log = getLatestLog(s.Id);
                                return (
                                    <div key={s.Id} className={`bg-white p-5 rounded-2xl shadow-sm border mb-4 ${log ? STATUS_COLORS[log.action_type].border : 'border-slate-200'}`}>
                                        <div className="flex justify-between items-center gap-4">
                                            <div className="flex-1 text-left"><div className="flex items-center gap-3"><h2 className="text-2xl font-black uppercase leading-none">{s._DPMetaData.EmployeeInfo.DisplayName}</h2>{s.IsManual && <button onClick={()=>handleRemoveManual(s.Id)} className="text-[8px] text-red-500 font-bold px-2 py-1 rounded bg-red-50 hover:bg-red-500 hover:text-white transition-colors">Remove</button>}</div><div className="mt-2 text-left"><TimeDisplay s={s} logs={attendanceLogs} onEdit={(id: any, type: string) => setActiveForm({id, type, name: s._DPMetaData.EmployeeInfo.DisplayName})} /></div></div>
                                            <div className="flex flex-wrap gap-1 print:hidden">{['ON_TIME', 'LATE', 'NO_SHOW', 'OTHER'].map(type => (
                                                <button key={type} onClick={() => {
                                                    if (type === 'NO_SHOW' || type === 'OTHER') {
                                                        setActiveForm({id: s.Id, type, name: s._DPMetaData.EmployeeInfo.DisplayName});
                                                    } else {
                                                        submitAttendance(s.Id.toString(), s._DPMetaData.EmployeeInfo.DisplayName, type, s.StartTime);
                                                    }
                                                }} className={`px-3 py-2 rounded-lg font-bold text-[9px] uppercase ${log?.action_type === type ? STATUS_COLORS[type].bg + " text-white scale-110 shadow-md" : "bg-slate-100 text-slate-400 opacity-40 hover:opacity-100"}`}>{type.replace('_',' ')}</button>
                                            ))}</div>
                                        </div>
                                        {log && <div className={`mt-4 p-3 rounded-xl border text-xs ${STATUS_COLORS[log.action_type].light} ${STATUS_COLORS[log.action_type].text} text-left`}><strong>{log.action_type.replace('_',' ')}:</strong> {log.notes}</div>}
                                    </div>
                                );
                            })
                        ) : (
                            Array.from(new Set(teamShifts.map(s => s._DPMetaData.EmployeeInfo.DisplayName))).sort().map(name => {
                                const staffShifts = teamShifts.filter(s => s._DPMetaData.EmployeeInfo.DisplayName === name);
                                return (
                                    <div key={name} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-6 print:mb-1 print:p-0 print:border-none print:shadow-none print:bg-transparent page-break-inside-avoid text-left">
                                        <h3 className="text-xl font-black text-slate-800 uppercase border-b pb-3 mb-4 tracking-tighter print:text-[8pt] print:mb-0.5 print:pb-0.5 print:border-slate-200 print:text-left">{name}</h3>
                                        <div className="grid grid-cols-7 gap-3 mb-2 print:grid-cols-7 print:gap-0">
                                            {weekRange.days.map(dStr => {
                                                const dShift = staffShifts.find(sh => (getLocalDateString(sh.IsManual ? sh.Date === dStr : sh.StartTime) === dStr));
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
        {activeForm && (
            <div className="fixed inset-0 bg-black/40 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm">
                <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg p-6 shadow-2xl animate-in slide-in-from-bottom duration-300 text-left">
                    <div className="flex justify-between items-center mb-6">
                        <div><h4 className="font-black text-slate-800 uppercase tracking-widest">{activeForm.type.replace('_',' ')}</h4><p className="text-[10px] font-bold text-slate-400 uppercase">Updating {activeForm.name}</p></div>
                        <button onClick={() => setActiveForm(null)} className="bg-slate-100 h-10 w-10 rounded-full text-slate-400 font-bold text-xl">×</button>
                    </div>
                    <div className="flex flex-col gap-4">
                        {activeForm.type === 'MARK' && (
                            <div className="grid grid-cols-2 gap-2">
                                {['ON_TIME', 'LATE', 'NO_SHOW', 'OTHER'].map(type => {
                                    const log = getLatestLog(activeForm.id);
                                    return (
                                        <button key={type} onClick={() => {
                                            if (type === 'NO_SHOW' || type === 'OTHER') {
                                                setActiveForm({...activeForm, type}); // SWITCH MODE TO SHOW NOTE BOX
                                            } else {
                                                submitAttendance(activeForm.id.toString(), activeForm.name || 'Staff', type);
                                            }
                                        }} className={`p-4 rounded-2xl font-black text-xs uppercase ${log?.action_type === type ? STATUS_COLORS[type].bg + " text-white" : "bg-slate-100 text-slate-500"}`}>{type.replace('_',' ')}</button>
                                    )
                                })}
                            </div>
                        )}
                        {activeForm.type.startsWith('EDIT') && (
                            <div className="bg-slate-50 p-4 rounded-2xl">
                                <label className="text-[10px] font-black uppercase text-slate-400 block mb-2 ml-1">Select New Time</label>
                                <input type="time" className="w-full p-4 rounded-xl bg-white border-2 border-slate-100 text-slate-900 font-black text-2xl outline-none" value={formTime} onChange={e => setFormTime(e.target.value)} />
                            </div>
                        )}
                        {/* Note box now appears if type is NO_SHOW or OTHER */}
                        {['NO_SHOW', 'OTHER'].includes(activeForm.type) && (
                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Mandatory Note</label>
                                <textarea autoFocus placeholder="Why was this shift missed? (Required)" className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-slate-100 outline-none h-32 text-slate-900" value={formNote} onChange={e => setFormNote(e.target.value)} />
                            </div>
                        )}
                        {activeForm.type !== 'MARK' && (
                            <button disabled={isSaving} onClick={() => {
                                const s = shifts.find(sh => sh.Id.toString() === activeForm.id.toString());
                                submitAttendance(activeForm.id.toString(), activeForm.name || 'Staff', activeForm.type, s?.StartTime);
                            }} className="w-full bg-slate-900 text-white p-5 rounded-2xl font-black uppercase text-xs shadow-lg">{isSaving ? 'Saving...' : 'Save Change'}</button>
                        )}
                    </div>
                </div>
            </div>
        )}

        {showManualModal && <ManualShiftModal data={newManualShift} setData={setNewManualShift} onSave={handleCreateManual} onClose={()=>setShowManualModal(false)} existingShifts={shifts} />}
      </div>
    </div>
  );
}