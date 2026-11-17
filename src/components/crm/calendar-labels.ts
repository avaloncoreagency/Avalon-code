import type { Lang } from "@/lib/i18n";
import { isCalendarDay } from "@/lib/crm/shared-calendar";
const MONTHS = {
 es:["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"],
 en:["January","February","March","April","May","June","July","August","September","October","November","December"],
};
const DAYS={es:["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"],en:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]};
/** Render-identical labels across Node/Chromium/Safari ICU versions. Day arithmetic is UTC. */
export function calendarMonthLabel(day:string,lang:Lang) {
 if(!isCalendarDay(day))return "—";
 return `${MONTHS[lang][Number(day.slice(5,7))-1]} ${day.slice(0,4)}`;
}
export function calendarDayLabel(day:string,lang:Lang) {
 if(!isCalendarDay(day))return "—";
 return `${DAYS[lang][new Date(day+'T12:00:00Z').getUTCDay()]} ${Number(day.slice(8,10))} ${MONTHS[lang][Number(day.slice(5,7))-1]}`;
}
