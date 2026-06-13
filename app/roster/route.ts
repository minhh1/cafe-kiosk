// app/api/roster/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  const url = `https://${process.env.DEPUTY_SUBDOMAIN}.deputy.com/api/v1/resource/Roster/QUERY`;
  
  // Gets today's date in YYYY-MM-DD
  const today = new Date().toISOString().split('T')[0];

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.DEPUTY_TOKEN}` },
    body: JSON.stringify({
      search: { f1: { field: "Date", type: "eq", data: today } }
    })
  });

  const data = await res.json();
  return NextResponse.json(data);
}