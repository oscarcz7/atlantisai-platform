import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'noah-web',
    timestamp: new Date().toISOString(),
  });
}
