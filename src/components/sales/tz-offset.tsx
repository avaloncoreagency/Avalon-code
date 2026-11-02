"use client";
import { useEffect, useRef } from "react";
/** Submits the browser's UTC offset so local due times are stored as correct UTC instants. */
export function TzOffset() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.value = String(new Date().getTimezoneOffset()); }, []);
  return <input ref={ref} type="hidden" name="tz_offset" defaultValue="0" />;
}
