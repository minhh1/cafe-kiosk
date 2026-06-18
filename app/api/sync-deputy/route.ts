import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export async function GET() {
  try {
    const { data: latest } = await supabase.from('deputy_shifts_mirror').select('modified_at').order('modified_at', { ascending: false }).limit(1).single();
    const lastSync = latest?.modified_at || new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const res = await fetch(`https://${process.env.DEPUTY_SUBDOMAIN}.deputy.com/api/v1/resource/Roster/QUERY`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.DEPUTY_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        search: { f1: { field: "Modified", type: "gt", data: lastSync } }, 
        join: ["Employee", "OperationalUnit"] 
      }),
    });

    const data = await res.json();
    if (!data || data.length === 0) return NextResponse.json({ message: "No changes" });

    const employees = new Map();
    const units = new Map();

    const shifts = data.map((s: any) => {
      const emp = s._DPMetaData?.EmployeeInfo;
      const unit = s._DPMetaData?.OperationalUnitInfo;
      
      if (emp) employees.set(emp.Id, { id: emp.Id, display_name: emp.DisplayName, photo: emp.Photo });
      if (unit) units.set(unit.Id, { id: unit.Id, unit_name: unit.OperationalUnitName, company_name: unit.CompanyName });

      return {
        id: s.Id, shift_date: s.Date.split('T')[0], start_time: s.StartTime, end_time: s.EndTime,
        meal_break: s.Mealbreak, slots: s.Slots, total_time: s.TotalTime, published: s.Published,
        modified_at: s.Modified, employee_id: s.Employee, operational_unit_id: s.OperationalUnit,
        dp_metadata: s._DPMetaData 
      };
    });

    // ORDER MATTERS: Save Parents then Children
    await supabase.from('deputy_employees').upsert(Array.from(employees.values()));
    await supabase.from('deputy_operational_units').upsert(Array.from(units.values()));
    await supabase.from('deputy_shifts_mirror').upsert(shifts);

    await supabase.from('sync_history').insert({ rows_affected: shifts.length, status: 'Success', details: `Synced ${shifts.length} items.` });

    return NextResponse.json({ synced: shifts.length });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}